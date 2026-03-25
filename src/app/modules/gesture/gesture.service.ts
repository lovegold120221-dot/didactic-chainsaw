import {Injectable, inject} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {forkJoin, Observable, of, throwError} from 'rxjs';
import {catchError, map, shareReplay, switchMap} from 'rxjs/operators';

type GestureAliasField = 'flemish' | 'dutch' | 'english' | 'id';

interface GestureAliasEntry {
  alias: string;
  field: GestureAliasField;
  sign: GestureSign;
}

interface GesturePosePoint {
  X: number;
  Y: number;
  Z?: number;
  C?: number;
}

interface GesturePoseFramePerson {
  id?: number;
  pose?: GesturePosePoint[];
  face?: GesturePosePoint[];
  left_hand?: GesturePosePoint[];
  right_hand?: GesturePosePoint[];
  [key: string]: number | GesturePosePoint[] | undefined;
}

interface GesturePoseFrame {
  _people?: number;
  people: GesturePoseFramePerson[];
}

interface GesturePoseComponent {
  name: string;
  format: string;
  points?: number;
  _points?: number;
  limbs?: Array<{from?: number; to?: number} | [number, number]>;
  colors?: Array<{R?: number; G?: number; B?: number}>;
}

interface GesturePoseData {
  header: {
    version: number;
    width: number;
    height: number;
    depth: number;
    components: GesturePoseComponent[];
  };
  body?: {
    fps: number;
    frames: GesturePoseFrame[];
  };
  fps?: number;
  frames?: GesturePoseFrame[];
}

export interface GestureSign {
  id: string;
  flemish?: string;
  dutch?: string;
  english?: string;
  category?: string;
  poseFile?: string;
  videoUrl?: string;
  regions?: string[];
  signId?: number;
}

export interface GestureManifest {
  language: string;
  languageName: string;
  languageNameEnglish: string;
  region: string;
  version: string;
  description: string;
  signs: GestureSign[];
}

export interface GestureLookupResult {
  word: string;
  sign: GestureSign | null;
  posePath: string | null;
  found: boolean;
}

export interface GestureSequenceResult {
  signs: GestureSign[];
  poseUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class GestureService {
  private static readonly MAX_LOCAL_SEQUENCE_SIGNS = 10;

  private http = inject(HttpClient);
  private textEncoder = new TextEncoder();

  private manifests = new Map<string, GestureManifest>();
  private aliasCache = new Map<string, Map<string, GestureAliasEntry[]>>();
  private maxAliasTokens = new Map<string, number>();
  private poseDataCache = new Map<string, Observable<GesturePoseData>>();

  loadManifest(language: string): Observable<GestureManifest> {
    if (this.manifests.has(language)) {
      return of(this.manifests.get(language)!);
    }

    const manifestPath = `assets/gestures/${language}/manifest.json`;
    return this.http.get<GestureManifest>(manifestPath).pipe(
      map(manifest => {
        this.manifests.set(language, manifest);
        this.buildSignCache(language, manifest);
        return manifest;
      }),
      catchError(error => {
        console.warn(`Failed to load manifest for ${language}:`, error);
        return of({language, signs: []} as GestureManifest);
      }),
      shareReplay(1)
    );
  }

  lookupWord(word: string, language: string = 'vgt', sourceLanguage: string = 'nl'): GestureLookupResult {
    const sign = this.lookupPhrase(word, language, sourceLanguage);
    return {
      word,
      sign,
      posePath: sign ? this.getPoseUrl(sign, language) : null,
      found: !!sign?.poseFile,
    };
  }

  translateTextToPoseSequence(
    text: string,
    language: string = 'vgt',
    sourceLanguage: string = 'nl'
  ): Observable<GestureSequenceResult | null> {
    return this.loadManifest(language).pipe(
      switchMap(() => {
        const directSigns = this.matchTextToSigns(text, language, sourceLanguage);
        if (directSigns?.length) {
          return this.buildPoseSequence(language, directSigns);
        }

        return this.resolveLookupText(text, language, sourceLanguage).pipe(
          switchMap(({lookupText, lookupLanguage}) => {
            const translatedSigns = this.matchTextToSigns(lookupText, language, lookupLanguage);
            if (!translatedSigns?.length) {
              return of(null);
            }

            return this.buildPoseSequence(language, translatedSigns);
          })
        );
      })
    );
  }

  getPoseUrl(sign: GestureSign, language: string = 'vgt'): string | null {
    if (!sign.poseFile) {
      return null;
    }

    return `assets/gestures/${language}/${sign.poseFile}`;
  }

  hasLocalGestures(language: string): boolean {
    return this.manifests.has(language);
  }

  getAvailableLanguages(): string[] {
    return Array.from(this.manifests.keys());
  }

  clearCache(): void {
    this.manifests.clear();
    this.aliasCache.clear();
    this.maxAliasTokens.clear();
    this.poseDataCache.clear();
  }

  private buildSignCache(language: string, manifest: GestureManifest): void {
    const aliases = new Map<string, GestureAliasEntry[]>();
    let maxTokens = 1;

    for (const sign of manifest.signs || []) {
      for (const entry of this.getAliasEntries(sign)) {
        const existingEntries = aliases.get(entry.alias) ?? [];
        existingEntries.push(entry);
        aliases.set(entry.alias, existingEntries);
        maxTokens = Math.max(maxTokens, entry.alias.split(' ').length);
      }
    }

    this.aliasCache.set(language, aliases);
    this.maxAliasTokens.set(language, maxTokens);
  }

  private getAliasEntries(sign: GestureSign): GestureAliasEntry[] {
    const aliasEntries: GestureAliasEntry[] = [];
    const fields: Array<[GestureAliasField, string | undefined]> = [
      ['flemish', sign.flemish],
      ['dutch', sign.dutch],
      ['english', sign.english],
      ['id', sign.id],
    ];

    for (const [field, rawValue] of fields) {
      if (!rawValue) {
        continue;
      }

      for (const alias of this.expandAliases(rawValue)) {
        aliasEntries.push({alias, field, sign});
      }
    }

    if (sign.signId) {
      aliasEntries.push({alias: String(sign.signId), field: 'id', sign});
    }

    return aliasEntries;
  }

  private expandAliases(rawValue: string): string[] {
    const values = new Set<string>();
    const variants = rawValue
      .split(/[;,]/)
      .flatMap(value => value.split('/'))
      .map(value => this.normalizeText(value))
      .filter(Boolean);

    for (const value of variants) {
      values.add(value);
    }

    const normalizedRawValue = this.normalizeText(rawValue);
    if (normalizedRawValue) {
      values.add(normalizedRawValue);
    }

    return Array.from(values);
  }

  private matchTextToSigns(text: string, language: string, sourceLanguage: string): GestureSign[] | null {
    const tokens = this.tokenizeText(text);
    if (tokens.length === 0) {
      return [];
    }

    if (tokens.length > GestureService.MAX_LOCAL_SEQUENCE_SIGNS) {
      return null;
    }

    const aliasEntries = this.aliasCache.get(language);
    const maxAliasTokenCount = this.maxAliasTokens.get(language) ?? 1;
    if (!aliasEntries?.size) {
      return null;
    }

    const signs: GestureSign[] = [];

    for (let index = 0; index < tokens.length; ) {
      let matchedSign: GestureSign | null = null;
      let matchedLength = 0;

      for (let length = Math.min(maxAliasTokenCount, tokens.length - index); length >= 1; length--) {
        const phrase = tokens.slice(index, index + length).join(' ');
        const sign = this.lookupPhrase(phrase, language, sourceLanguage);
        if (sign?.poseFile) {
          matchedSign = sign;
          matchedLength = length;
          break;
        }
      }

      if (!matchedSign || matchedLength === 0) {
        return null;
      }

      signs.push(matchedSign);
      index += matchedLength;
    }

    return signs;
  }

  private lookupPhrase(phrase: string, language: string, sourceLanguage: string): GestureSign | null {
    const normalizedPhrase = this.normalizeText(phrase);
    if (!normalizedPhrase) {
      return null;
    }

    const aliasEntries = this.aliasCache.get(language)?.get(normalizedPhrase);
    if (!aliasEntries?.length) {
      return null;
    }

    return [...aliasEntries].sort((a, b) => this.rankEntry(b, sourceLanguage) - this.rankEntry(a, sourceLanguage))[0]
      .sign;
  }

  private rankEntry(entry: GestureAliasEntry, sourceLanguage: string): number {
    const preferredFields = this.preferredFields(sourceLanguage);
    const fieldRank = Math.max(0, preferredFields.length - preferredFields.indexOf(entry.field));

    let score = fieldRank * 100;
    if (entry.sign.poseFile) {
      score += 1000;
    }
    if (entry.sign.category === 'basic') {
      score += 200;
    }
    if (entry.sign.category === 'Vlaanderen') {
      score += 100;
    }
    if (entry.sign.regions?.includes('Vlaanderen')) {
      score += 100;
    }

    return score;
  }

  private preferredFields(sourceLanguage: string): GestureAliasField[] {
    const normalizedLanguage = (sourceLanguage ?? '').toLowerCase();
    if (normalizedLanguage.startsWith('en')) {
      return ['english', 'dutch', 'flemish', 'id'];
    }
    if (normalizedLanguage.startsWith('nl') || normalizedLanguage === 'vgt') {
      return ['dutch', 'flemish', 'english', 'id'];
    }

    return ['dutch', 'flemish', 'english', 'id'];
  }

  private resolveLookupText(
    text: string,
    language: string,
    sourceLanguage: string
  ): Observable<{lookupText: string; lookupLanguage: string}> {
    const normalizedSourceLanguage = (sourceLanguage ?? '').toLowerCase();
    if (language !== 'vgt' || !normalizedSourceLanguage || normalizedSourceLanguage.startsWith('nl')) {
      return of({lookupText: text, lookupLanguage: sourceLanguage});
    }

    return this.translateText(text, normalizedSourceLanguage, 'nl').pipe(
      map(lookupText => ({lookupText, lookupLanguage: 'nl'})),
      catchError(() => of({lookupText: text, lookupLanguage: sourceLanguage}))
    );
  }

  private translateText(text: string, fromLanguage: string, toLanguage: string): Observable<string> {
    if (!fromLanguage || fromLanguage === toLanguage) {
      return of(text);
    }

    const encodedText = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_a/single?client=web&sl=${fromLanguage}&tl=${toLanguage}&dt=t&q=${encodedText}`;

    return this.http.get(url, {responseType: 'text'}).pipe(
      map(response => {
        try {
          const data = JSON.parse(response);
          if (Array.isArray(data?.[0])) {
            return data[0].map((item: unknown[]) => item[0]).join('');
          }
        } catch {
          // Fall through to the original text when the response shape is unexpected.
        }

        return text;
      })
    );
  }

  private normalizeText(text: string): string {
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeText(text: string): string[] {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) {
      return [];
    }

    return normalizedText.split(' ').filter(Boolean);
  }

  private loadPoseData(language: string, sign: GestureSign): Observable<GesturePoseData> {
    const poseJsonPath = this.getPoseJsonPath(language, sign);
    if (!poseJsonPath) {
      throw new Error(`Missing pose file for sign "${sign.id}"`);
    }

    const cachedPoseData = this.poseDataCache.get(poseJsonPath);
    if (cachedPoseData) {
      return cachedPoseData;
    }

    const poseData$ = this.http.get<GesturePoseData>(poseJsonPath).pipe(
      shareReplay(1),
      catchError(error => {
        this.poseDataCache.delete(poseJsonPath);
        return throwError(() => error);
      })
    );

    this.poseDataCache.set(poseJsonPath, poseData$);
    return poseData$;
  }

  private getPoseJsonPath(language: string, sign: GestureSign): string | null {
    if (!sign.poseFile) {
      return null;
    }

    const normalizedPoseFile = sign.poseFile.endsWith('.json') ? sign.poseFile : `${sign.poseFile}.json`;
    return `assets/gestures/${language}/${normalizedPoseFile}`;
  }

  private combinePoseData(poseDataList: GesturePoseData[]): GesturePoseData {
    const firstPose = poseDataList[0];
    const fps = firstPose.body?.fps ?? firstPose.fps ?? 30;
    const frames: GesturePoseFrame[] = [];

    poseDataList.forEach((poseData, index) => {
      const poseFrames = poseData.body?.frames ?? poseData.frames ?? [];
      frames.push(...poseFrames.map(frame => this.clone(frame)));

      if (index < poseDataList.length - 1 && poseFrames.length > 0) {
        const holdFrame = this.clone(poseFrames[poseFrames.length - 1]);
        const holdFrameCount = Math.max(2, Math.round(fps * 0.15));
        for (let i = 0; i < holdFrameCount; i++) {
          frames.push(this.clone(holdFrame));
        }
      }
    });

    return {
      header: this.clone(firstPose.header),
      body: {
        fps,
        frames,
      },
    };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private buildPoseSequence(language: string, signs: GestureSign[]): Observable<GestureSequenceResult | null> {
    return forkJoin(signs.map(sign => this.loadPoseData(language, sign))).pipe(
      map(poseDataList => ({
        signs,
        poseUrl: this.createPoseObjectUrl(this.combinePoseData(poseDataList)),
      })),
      catchError(error => {
        console.warn(`Failed to build local ${language} gesture sequence:`, error);
        return of(null);
      })
    );
  }

  private createPoseObjectUrl(poseData: GesturePoseData): string {
    const binaryPose = this.serializePose(poseData);
    const poseBuffer = new ArrayBuffer(binaryPose.byteLength);
    new Uint8Array(poseBuffer).set(binaryPose);
    return URL.createObjectURL(new Blob([poseBuffer], {type: 'application/octet-stream'}));
  }

  private serializePose(poseData: GesturePoseData): Uint8Array {
    const headerBytes = this.serializeHeader(poseData.header);
    const bodyBytes = this.serializeBody(poseData);
    return this.concatBytes([headerBytes, bodyBytes]);
  }

  private serializeHeader(header: GesturePoseData['header']): Uint8Array {
    const componentBytes = (header.components ?? []).map(component => this.serializeComponent(component));
    const headerLength = 16 + componentBytes.reduce((sum, bytes) => sum + bytes.length, 0);

    return this.concatBytes([
      this.float32LE(header.version ?? 0.2),
      this.uint16LE(header.width ?? 1000),
      this.uint16LE(header.height ?? 1000),
      this.uint16LE(header.depth ?? 3),
      this.uint16LE(header.components?.length ?? 0),
      this.uint32LE(headerLength),
      ...componentBytes,
    ]);
  }

  private serializeComponent(component: GesturePoseComponent): Uint8Array {
    const pointCount = component.points ?? component._points ?? 0;
    const limbs = component.limbs ?? [];
    const colors = component.colors ?? [];
    const parts: Uint8Array[] = [
      this.stringLE(component.name ?? ''),
      this.stringLE(component.format ?? ''),
      this.uint16LE(pointCount),
      this.uint16LE(limbs.length),
      this.uint16LE(colors.length),
    ];

    for (let i = 0; i < pointCount; i++) {
      parts.push(this.stringLE(''));
    }

    for (const limb of limbs) {
      const from = 'from' in limb ? (limb.from ?? 0) : (limb[0] ?? 0);
      const to = 'to' in limb ? (limb.to ?? 0) : (limb[1] ?? 0);
      parts.push(this.uint16LE(from), this.uint16LE(to));
    }

    for (const color of colors) {
      parts.push(this.uint16LE(color.R ?? 255), this.uint16LE(color.G ?? 255), this.uint16LE(color.B ?? 255));
    }

    return this.concatBytes(parts);
  }

  private serializeBody(poseData: GesturePoseData): Uint8Array {
    const frames = poseData.body?.frames ?? poseData.frames ?? [];
    const fps = poseData.body?.fps ?? poseData.fps ?? 30;
    const components = poseData.header.components ?? [];
    const parts: Uint8Array[] = [
      this.float32LE(fps),
      this.uint32LE(frames.length),
      this.uint16LE(frames.some(frame => (frame.people?.length ?? 0) > 0) ? 1 : 0),
    ];

    for (const frame of frames) {
      const people = frame.people ?? [];
      parts.push(this.uint16LE(people.length));

      for (const person of people) {
        parts.push(this.int16LE((person.id as number) ?? 1));

        for (const component of components) {
          const pointCount = component.points ?? component._points ?? 0;
          const rawPoints = person[component.name];
          const points = Array.isArray(rawPoints) ? rawPoints : [];

          for (let index = 0; index < pointCount; index++) {
            const point = points[index] ?? {X: 0, Y: 0, Z: 0, C: 0};
            parts.push(
              this.float32LE(point.X ?? 0),
              this.float32LE(point.Y ?? 0),
              this.float32LE(point.Z ?? 0),
              this.float32LE(point.C ?? 0)
            );
          }
        }
      }
    }

    return this.concatBytes(parts);
  }

  private concatBytes(parts: Uint8Array[]): Uint8Array {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    return result;
  }

  private stringLE(value: string): Uint8Array {
    const bytes = this.textEncoder.encode(value);
    return this.concatBytes([this.uint16LE(bytes.length), bytes]);
  }

  private uint16LE(value: number): Uint8Array {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    return new Uint8Array(buffer);
  }

  private int16LE(value: number): Uint8Array {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setInt16(0, value, true);
    return new Uint8Array(buffer);
  }

  private uint32LE(value: number): Uint8Array {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    return new Uint8Array(buffer);
  }

  private float32LE(value: number): Uint8Array {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    return new Uint8Array(buffer);
  }
}

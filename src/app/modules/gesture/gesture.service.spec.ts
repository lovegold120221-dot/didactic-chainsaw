import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {GestureManifest, GestureSequenceResult, GestureService} from './gesture.service';

describe('GestureService', () => {
  let service: GestureService;
  let httpMock: HttpTestingController;

  const seedManifest = (manifest: GestureManifest) => {
    const internalService = service as any;
    internalService.manifests.set('vgt', manifest);
    internalService.buildSignCache('vgt', manifest);
  };

  const createPoseData = (x: number) => ({
    header: {
      version: 0.2,
      width: 1000,
      height: 1000,
      depth: 3,
      components: [{name: 'pose', format: 'XYZC', points: 1}],
    },
    body: {
      fps: 30,
      frames: [
        {
          people: [
            {
              pose: [{X: x, Y: 0.5, Z: 0, C: 1}],
            },
          ],
        },
      ],
    },
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(GestureService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('matches exact aliases without falling back to substrings', () => {
    seedManifest({
      language: 'vgt',
      languageName: 'Vlaamse Gebarentaal',
      languageNameEnglish: 'Flemish Sign Language',
      region: 'Belgium',
      version: '1.0',
      description: 'Test manifest',
      signs: [
        {
          id: 'vgt_bliksem',
          dutch: 'bliksem',
          poseFile: 'poses/vgt_bliksem.pose',
        },
      ],
    });

    expect(service.lookupWord('ik', 'vgt', 'nl')).toEqual({
      word: 'ik',
      sign: null,
      posePath: null,
      found: false,
    });
  });

  it('builds a local VGT pose sequence when every token is covered', () => {
    seedManifest({
      language: 'vgt',
      languageName: 'Vlaamse Gebarentaal',
      languageNameEnglish: 'Flemish Sign Language',
      region: 'Belgium',
      version: '1.0',
      description: 'Test manifest',
      signs: [
        {
          id: 'vgt_ik',
          dutch: 'ik',
          flemish: 'IK',
          poseFile: 'poses/vgt_ik.pose',
        },
        {
          id: 'vgt_ben',
          dutch: 'ben',
          flemish: 'BEN',
          poseFile: 'poses/vgt_ben.pose',
        },
      ],
    });

    let result: GestureSequenceResult | null | undefined;
    service.translateTextToPoseSequence('ik ben', 'vgt', 'nl').subscribe(value => {
      result = value;
    });

    httpMock.expectOne('assets/gestures/vgt/poses/vgt_ik.pose.json').flush(createPoseData(0.1));
    httpMock.expectOne('assets/gestures/vgt/poses/vgt_ben.pose.json').flush(createPoseData(0.2));

    expect(result).toBeTruthy();
    expect(result?.signs.map(sign => sign.id)).toEqual(['vgt_ik', 'vgt_ben']);
    expect(result?.poseUrl.startsWith('blob:')).toBeTrue();

    if (result?.poseUrl) {
      URL.revokeObjectURL(result.poseUrl);
    }
  });
});

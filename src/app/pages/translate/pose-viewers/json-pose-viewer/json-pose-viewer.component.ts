import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  inject,
} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';

interface PosePoint {
  X: number;
  Y: number;
  Z: number;
  C: number;
}

interface PoseFrame {
  _people?: number;
  people: {
    id?: number;
    pose: PosePoint[];
    face: PosePoint[];
    left_hand: PosePoint[];
    right_hand: PosePoint[];
  }[];
}

interface PoseData {
  header: {
    version: number;
    width: number;
    height: number;
    depth: number;
    components: {
      name: string;
      format: string;
      points: number;
      limbs?: any[];
      colors?: any[];
    }[];
  };
  body?: {
    fps: number;
    frames: PoseFrame[];
  };
  frames?: PoseFrame[];
}

@Component({
  selector: 'app-json-pose-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pose-viewer" #viewerContainer>
      <svg
        [attr.viewBox]="'0 0 ' + poseWidth + ' ' + poseHeight"
        [attr.width]="poseWidth"
        [attr.height]="poseHeight"
        class="pose-svg">
        <!-- Background grid -->
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#333" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- Current frame skeleton -->
        @if (currentFrame) {
          @for (person of currentFrame.people; track $index) {
            <!-- Pose skeleton -->
            <g class="pose-skeleton">
              <!-- Spine and torso -->
              <line
                [attr.x1]="getX(person.pose, 11)"
                [attr.y1]="getY(person.pose, 11)"
                [attr.x2]="getX(person.pose, 12)"
                [attr.y2]="getY(person.pose, 12)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 11)"
                [attr.y1]="getY(person.pose, 11)"
                [attr.x2]="getX(person.pose, 23)"
                [attr.y2]="getY(person.pose, 23)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 12)"
                [attr.y1]="getY(person.pose, 12)"
                [attr.x2]="getX(person.pose, 24)"
                [attr.y2]="getY(person.pose, 24)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 23)"
                [attr.y1]="getY(person.pose, 23)"
                [attr.x2]="getX(person.pose, 24)"
                [attr.y2]="getY(person.pose, 24)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />

              <!-- Head -->
              <circle
                [attr.cx]="getX(person.pose, 0)"
                [attr.cy]="getY(person.pose, 0)"
                r="20"
                fill="none"
                stroke="#ff00ff"
                stroke-width="2" />

              <!-- Face dots -->
              @for (i of faceIndices; track i) {
                @if (getPoint(person.face, i)) {
                  <circle
                    [attr.cx]="getX(person.face, i)"
                    [attr.cy]="getY(person.face, i)"
                    r="2"
                    fill="#ff00ff"
                    opacity="0.7" />
                }
              }

              <!-- Left arm -->
              <line
                [attr.x1]="getX(person.pose, 11)"
                [attr.y1]="getY(person.pose, 11)"
                [attr.x2]="getX(person.pose, 13)"
                [attr.y2]="getY(person.pose, 13)"
                stroke="#ffff00"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 13)"
                [attr.y1]="getY(person.pose, 13)"
                [attr.x2]="getX(person.pose, 15)"
                [attr.y2]="getY(person.pose, 15)"
                stroke="#ffff00"
                stroke-width="3"
                stroke-linecap="round" />

              <!-- Right arm -->
              <line
                [attr.x1]="getX(person.pose, 12)"
                [attr.y1]="getY(person.pose, 12)"
                [attr.x2]="getX(person.pose, 14)"
                [attr.y2]="getY(person.pose, 14)"
                stroke="#00ff00"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 14)"
                [attr.y1]="getY(person.pose, 14)"
                [attr.x2]="getX(person.pose, 16)"
                [attr.y2]="getY(person.pose, 16)"
                stroke="#00ff00"
                stroke-width="3"
                stroke-linecap="round" />

              <!-- Left hand points -->
              @for (pt of person.left_hand; track $index) {
                <circle
                  [attr.cx]="pt.X * poseWidth"
                  [attr.cy]="pt.Y * poseHeight"
                  r="4"
                  fill="#ffff00"
                  stroke="#ffaa00"
                  stroke-width="1" />
              }

              <!-- Right hand points -->
              @for (pt of person.right_hand; track $index) {
                <circle
                  [attr.cx]="pt.X * poseWidth"
                  [attr.cy]="pt.Y * poseHeight"
                  r="4"
                  fill="#00ff00"
                  stroke="#00aa00"
                  stroke-width="1" />
              }

              <!-- Left leg -->
              <line
                [attr.x1]="getX(person.pose, 23)"
                [attr.y1]="getY(person.pose, 23)"
                [attr.x2]="getX(person.pose, 25)"
                [attr.y2]="getY(person.pose, 25)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 25)"
                [attr.y1]="getY(person.pose, 25)"
                [attr.x2]="getX(person.pose, 27)"
                [attr.y2]="getY(person.pose, 27)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 27)"
                [attr.y1]="getY(person.pose, 27)"
                [attr.x2]="getX(person.pose, 29)"
                [attr.y2]="getY(person.pose, 29)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 29)"
                [attr.y1]="getY(person.pose, 29)"
                [attr.x2]="getX(person.pose, 31)"
                [attr.y2]="getY(person.pose, 31)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />

              <!-- Right leg -->
              <line
                [attr.x1]="getX(person.pose, 24)"
                [attr.y1]="getY(person.pose, 24)"
                [attr.x2]="getX(person.pose, 26)"
                [attr.y2]="getY(person.pose, 26)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 26)"
                [attr.y1]="getY(person.pose, 26)"
                [attr.x2]="getX(person.pose, 28)"
                [attr.y2]="getY(person.pose, 28)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 28)"
                [attr.y1]="getY(person.pose, 28)"
                [attr.x2]="getX(person.pose, 30)"
                [attr.y2]="getY(person.pose, 30)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />
              <line
                [attr.x1]="getX(person.pose, 30)"
                [attr.y1]="getY(person.pose, 30)"
                [attr.x2]="getX(person.pose, 32)"
                [attr.y2]="getY(person.pose, 32)"
                stroke="#00ffff"
                stroke-width="3"
                stroke-linecap="round" />

              <!-- Pose landmarks -->
              @for (pt of person.pose; track $index) {
                <circle
                  [attr.cx]="pt.X * poseWidth"
                  [attr.cy]="pt.Y * poseHeight"
                  [attr.r]="getRoiRadius($index)"
                  [attr.fill]="getPointColor(pt.C)"
                  stroke="#ffffff"
                  stroke-width="1"
                  opacity="0.9" />
              }
            </g>
          }
        }
      </svg>

      <!-- Controls -->
      <div class="controls">
        <button (click)="togglePlay()" class="btn">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <span class="info">{{ currentFrameIndex + 1 }} / {{ totalFrames }}</span>
        <input
          type="range"
          [min]="0"
          [max]="totalFrames - 1"
          [(ngModel)]="currentFrameIndex"
          (change)="onSliderChange()" />
      </div>
    </div>
  `,
  styles: [
    `
      .pose-viewer {
        width: 100%;
        background: #1a1a2e;
        border-radius: 8px;
        overflow: hidden;
      }
      .pose-svg {
        display: block;
        background: linear-gradient(135deg, #0a0a14 0%, #1a1a2e 100%);
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: #0f0f1a;
      }
      .btn {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: #e94560;
        color: white;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .btn:hover {
        background: #ff6b8a;
      }
      .info {
        color: #aaa;
        font-size: 13px;
        min-width: 60px;
        text-align: center;
      }
      input[type='range'] {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        background: #333;
        border-radius: 3px;
      }
      input[type='range']::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #e94560;
        cursor: pointer;
      }
    `,
  ],
})
export class JsonPoseViewerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() src: string;
  @ViewChild('viewerContainer') container: ElementRef;

  private http = inject(HttpClient);

  poseWidth = 500;
  poseHeight = 500;
  poseData: PoseData | null = null;
  currentFrameIndex = 0;
  totalFrames = 0;
  fps = 30;
  isPlaying = false;

  private animationInterval: any;
  faceIndices: number[] = Array.from({length: 468}, (_, i) => i);

  ngAfterViewInit(): void {
    if (this.src) {
      this.loadPose(this.src);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src'] && this.src) {
      this.loadPose(this.src);
    }
  }

  loadPose(url: string): void {
    this.http.get<PoseData>(url).subscribe({
      next: data => {
        this.poseData = data;
        const frames = data.body?.frames || data.frames || [];
        this.totalFrames = frames.length;
        this.poseWidth = data.header?.width || 500;
        this.poseHeight = data.header?.height || 500;
        this.fps = data.body?.fps || 30;
        this.currentFrameIndex = 0;
      },
      error: err => {
        console.error('Failed to load pose:', err);
      },
    });
  }

  get currentFrame(): PoseFrame | null {
    if (!this.poseData) return null;
    const frames = this.poseData.body?.frames || this.poseData.frames || [];
    return frames[this.currentFrameIndex] || null;
  }

  getPoint(points: PosePoint[], index: number): PosePoint | null {
    if (!points || index < 0 || index >= points.length) return null;
    return points[index];
  }

  getX(points: PosePoint[], index: number): number {
    const pt = this.getPoint(points, index);
    return pt ? pt.X * this.poseWidth : 0;
  }

  getY(points: PosePoint[], index: number): number {
    const pt = this.getPoint(points, index);
    return pt ? pt.Y * this.poseHeight : 0;
  }

  getPointColor(confidence: number): string {
    if (confidence === undefined || confidence === null) return '#00ff00';
    if (confidence > 0.7) return '#00ff00';
    if (confidence > 0.4) return '#ffff00';
    return '#ff4444';
  }

  getRoiRadius(index: number): number {
    const roiIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24];
    return roiIndices.includes(index) ? 6 : 4;
  }

  togglePlay(): void {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }
  }

  startAnimation(): void {
    this.stopAnimation();
    if (this.totalFrames <= 1) return;

    const interval = 1000 / this.fps;
    this.animationInterval = setInterval(() => {
      this.currentFrameIndex = (this.currentFrameIndex + 1) % this.totalFrames;
    }, interval);
  }

  stopAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  onSliderChange(): void {
    if (this.isPlaying) {
      this.startAnimation();
    }
  }

  ngOnDestroy(): void {
    this.stopAnimation();
  }
}

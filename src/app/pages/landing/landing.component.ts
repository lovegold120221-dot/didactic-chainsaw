import {Component, inject} from '@angular/core';
import {MediaMatcher} from '@angular/cdk/layout';
import {IonContent} from '@ionic/angular/standalone';
import {RouterOutlet} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  imports: [IonContent, RouterOutlet, TranslocoPipe],
})
export class LandingComponent {
  private mediaMatcher = inject(MediaMatcher);
  isMobile = this.mediaMatcher.matchMedia('(max-width: 768px)');

  pages = [
    {key: 'home', route: '/'},
    {key: 'about', route: '/about'},
    {key: 'contribute', route: '/about/contribute'},
  ];

  // TODO: remove this when i18n is supported
  private transloco = inject(TranslocoService);
  lastActiveLang = this.transloco.getActiveLang();

  ionViewWillEnter() {
    this.transloco.setActiveLang('en');
  }

  ionViewWillLeave() {
    this.transloco.setActiveLang(this.lastActiveLang);
  }
}

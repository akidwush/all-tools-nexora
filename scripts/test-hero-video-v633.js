const assert = require('assert');
const fs = require('fs');

const pkg = require('../package.json');
const performanceJs = fs.readFileSync('assets/js/core/performance.js', 'utf8');
const coreCss = fs.readFileSync('assets/css/core.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.equal(pkg.version, '6.3.16');
assert(performanceJs.includes('heroMode=lowPower?"disabled":(mobileLike?"manual":"auto")'));
assert(performanceJs.includes('IntersectionObserver'));
assert(performanceJs.includes('window.scrollY>24'));
assert(performanceJs.includes('pauseVideo()'));
assert(performanceJs.includes('heroMode==="manual"'));
assert(!performanceJs.includes('else document.documentElement.classList.add("nx-anime-banner-enabled")'));
assert(!coreCss.includes('nx-anime-banner-enabled'));
assert(coreCss.includes('nx-hero-video-manual'));
assert(coreCss.includes('nx-hero-video-disabled'));
assert(index.includes('data-nx-hero-toggle'));
assert(index.includes('preload="none"'));
assert(!index.includes('autoplay'));

console.log('Nexora hero video tests lulus: video hero mobile manual, pause saat scroll/out-of-view, tanpa autoplay paksa, banner tetap tersedia.');

const assert = require('assert');
const fs = require('fs');

const pkg = require('../package.json');
const performanceJs = fs.readFileSync('assets/js/core/performance.js', 'utf8');
const coreCss = fs.readFileSync('assets/css/core.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.equal(pkg.version, '6.3.18');
assert(performanceJs.includes('heroMode="auto"'));
assert(performanceJs.includes('IntersectionObserver'));
assert(performanceJs.includes('armInteractionRetry'));
assert(performanceJs.includes('interactionRetryUsed=true'));
assert(performanceJs.includes('video.controls=false'));
assert(!performanceJs.includes('pauseVideo'));
assert(!performanceJs.includes('autoplayRejected'));
assert(performanceJs.includes('/api/database?resource=settings'));
assert(!performanceJs.includes('else document.documentElement.classList.add("nx-anime-banner-enabled")'));
assert(!coreCss.includes('nx-anime-banner-enabled'));
assert(coreCss.includes('html.nx-low-power .video-banner video{display:block}'));
assert(!coreCss.includes('nx-hero-video-toggle'));
assert(!index.includes('data-nx-hero-toggle'));
assert(index.includes('preload="metadata"'));
assert(index.includes('autoplay=""'));
assert(index.includes('muted=""'));
assert(index.includes('loop=""'));
assert(index.includes('playsinline=""'));

console.log('Nexora hero video tests lulus: video selalu autoplay, muted, loop, inline, tanpa kontrol pause, dengan retry interaksi aman.');

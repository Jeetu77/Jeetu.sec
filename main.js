(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Intro ---------- */
  var intro = document.getElementById('intro');
  document.body.classList.add('loading');
  setTimeout(function () {
    intro.classList.add('done');
    document.body.classList.remove('loading');
  }, reduceMotion ? 200 : 2000);

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  navLinks.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- Scroll reveal + active nav link ---------- */
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

  var sectionObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      navLinks.querySelectorAll('a').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach(function (s) { sectionObserver.observe(s); });

  /* ---------- 3D tilt cards ---------- */
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.tilt').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (x * 12).toFixed(2) + 'deg) rotateX(' + (-y * 12).toFixed(2) + 'deg) translateZ(8px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* ---------- Contact form (Netlify Forms) ---------- */
  var form = document.getElementById('contactForm');
  var formStatus = document.getElementById('formStatus');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formStatus.textContent = 'Sending...';
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.reset();
      formStatus.textContent = 'Message sent. I will get back to you soon.';
    }).catch(function () {
      formStatus.textContent = 'Could not send. Please email me directly instead.';
    });
  });

  /* ---------- 3D scene ---------- */
  if (!window.THREE) return;
  var THREE = window.THREE;
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (err) {
    return; // no WebGL: the CSS background still carries the look
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  var FOV = 50;
  var CAM_Z = 14;
  var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = CAM_Z;

  // soft round glow texture shared by embers and the halo
  function glowTexture(inner, outer) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.25, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* Embers: three depth layers so near ones are big and blurry, far ones are fine sparks */
  var SPAN_Y = 26; // vertical wrap range around the camera
  function makeEmbers(count, size, opacity, zMin, zMax) {
    var pos = new Float32Array(count * 3);
    var seed = new Float32Array(count * 3); // speed, sway phase, sway amount
    for (var i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = (Math.random() - 0.5) * SPAN_Y;
      pos[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
      seed[i * 3] = 0.15 + Math.random() * 0.7;
      seed[i * 3 + 1] = Math.random() * Math.PI * 2;
      seed[i * 3 + 2] = 0.1 + Math.random() * 0.5;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      size: size,
      map: glowTexture('rgba(255,235,220,1)', 'rgba(255,45,30,0.85)'),
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.userData.seed = seed;
    scene.add(points);
    return points;
  }
  var emberLayers = [
    makeEmbers(520, 0.16, 0.9, -22, -4),
    makeEmbers(160, 0.42, 0.75, -6, 5),
    makeEmbers(26, 1.9, 0.35, 4, 10)
  ];

  /* Hero object: glowing wireframe core with orbit rings */
  var hero = new THREE.Group();
  scene.add(hero);

  var halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,120,60,0.95)', 'rgba(255,25,20,0.55)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  halo.scale.set(11, 11, 1);
  halo.position.z = -1.5;
  hero.add(halo);

  // the portrait (a DOM element above the canvas) sits in the middle of this group
  var PHOTO_RADIUS = 2.6;
  var photo = document.getElementById('heroPhoto');

  var shell = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.9, 2)),
    new THREE.LineBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.16 })
  );
  hero.add(shell);

  var nodes = new THREE.Points(
    new THREE.IcosahedronGeometry(2.9, 2),
    new THREE.PointsMaterial({
      size: 0.14, map: glowTexture('rgba(255,255,255,1)', 'rgba(255,70,40,0.9)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  hero.add(nodes);

  function ring(radius, tube, color, opacity, rx, ry) {
    var m = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 160),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.set(rx, ry, 0);
    hero.add(m);
    return m;
  }
  var ringA = ring(3.7, 0.022, 0xffd2c4, 0.95, 1.25, 0.35);
  var ringB = ring(4.3, 0.012, 0xff3b2a, 0.7, 1.05, -0.5);
  var ringC = ring(3.2, 0.05, 0xff5a3c, 0.35, 1.5, 0.1);

  /* Layout: keep the object beside the copy on desktop, above it on mobile */
  var worldPerPx = 1;
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var visibleH = 2 * Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    var visibleW = visibleH * camera.aspect;
    worldPerPx = visibleH / h;
    // centre the rings on the portrait and size them to it
    var r = photo.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + window.scrollY + r.height / 2;
    hero.position.set((cx - w / 2) * worldPerPx, -(cy - h / 2) * worldPerPx, 0);
    hero.scale.setScalar(((r.width / 2) * worldPerPx) / PHOTO_RADIUS);
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);

  var mouseX = 0, mouseY = 0, lookX = 0, lookY = 0;
  window.addEventListener('pointermove', function (e) {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  });

  var clock = new THREE.Clock();
  function frame() {
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    // camera follows the page so z=0 scrolls with the content and other depths parallax
    var camY = -window.scrollY * worldPerPx;
    lookX += (mouseX - lookX) * 0.05;
    lookY += (mouseY - lookY) * 0.05;
    camera.position.set(lookX * 1.2, camY - lookY * 0.8, CAM_Z);
    camera.lookAt(0, camY, 0);

    emberLayers.forEach(function (layer) {
      var p = layer.geometry.attributes.position.array;
      var s = layer.userData.seed;
      for (var i = 0; i < p.length; i += 3) {
        p[i + 1] += s[i] * dt * 1.4;
        p[i] += Math.sin(t * 0.6 + s[i + 1]) * s[i + 2] * dt;
        // wrap vertically around the camera so embers fill every section
        var rel = p[i + 1] - camY;
        if (rel > SPAN_Y / 2) p[i + 1] -= SPAN_Y;
        else if (rel < -SPAN_Y / 2) p[i + 1] += SPAN_Y;
      }
      layer.geometry.attributes.position.needsUpdate = true;
    });

    shell.rotation.y = nodes.rotation.y = -t * 0.1;
    shell.rotation.z = nodes.rotation.z = t * 0.05;
    ringA.rotation.z = t * 0.5;
    ringB.rotation.z = -t * 0.3;
    ringC.rotation.z = t * 0.18;
    hero.rotation.y = lookX * 0.6;
    hero.rotation.x = lookY * 0.4;
    var breathe = 1 + Math.sin(t * 1.4) * 0.04;
    halo.scale.set(11 * breathe, 11 * breathe, 1);

    renderer.render(scene, camera);
    if (!reduceMotion) requestAnimationFrame(frame);
  }
  frame();
  if (reduceMotion) window.addEventListener('scroll', frame, { passive: true });
})();

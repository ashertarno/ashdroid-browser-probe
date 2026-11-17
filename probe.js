// Browser probe page: prints what this browser can do, in large text. Every
// check is isolated, so one failing check never blanks the others. Written in
// conservative JavaScript with no build.
(function () {
  'use strict';

  var VERSION = '1';
  var FRAME_INTERVAL_MS = 33;
  var MAX_FRAMES_IN_DECODER = 3;
  var FLUSH_AFTER_SILENT_MS = 1000;
  var LOCATION_TIMEOUT_MS = 15000;

  var CODECS = [
    { label: 'H.264 Baseline 720p', codec: 'avc1.42001f', width: 1280, height: 720 },
    { label: 'H.264 High 720p', codec: 'avc1.640028', width: 1280, height: 720 },
    { label: 'H.264 High 1080p', codec: 'avc1.640028', width: 1920, height: 1080 },
    { label: 'H.265 720p', codec: 'hev1.1.6.L93.B0', width: 1280, height: 720 },
    { label: 'VP9 720p', codec: 'vp09.00.31.08', width: 1280, height: 720 },
    { label: 'AV1 720p', codec: 'av01.0.05M.08', width: 1280, height: 720 }
  ];

  // ---- Output ----

  var sectionsEl = document.getElementById('sections');

  function section(title) {
    var el = document.createElement('section');
    var heading = document.createElement('h2');
    heading.textContent = title;
    el.appendChild(heading);
    sectionsEl.appendChild(el);
    return el;
  }

  // Adds a labelled row and returns a function that sets its value.
  // kind is 'yes', 'no', 'wait' or omitted for a plain fact.
  function row(parent, label, long) {
    var el = document.createElement('div');
    el.className = long ? 'row long' : 'row';
    var labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    var valueEl = document.createElement('span');
    el.appendChild(labelEl);
    el.appendChild(valueEl);
    parent.appendChild(el);
    function set(text, kind) {
      valueEl.className = 'value' + (kind ? ' ' + kind : '');
      valueEl.textContent = text;
    }
    set('checking', 'wait');
    return set;
  }

  function yesNo(set, value) {
    set(value ? 'yes' : 'no', value ? 'yes' : 'no');
  }

  function button(parent, label, onTap) {
    var el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', onTap);
    parent.appendChild(el);
    return el;
  }

  function message(error) {
    if (!error) return 'unknown error';
    return (error.name ? error.name + ': ' : '') + (error.message || String(error));
  }

  // Runs one check so that an exception shows in its own row.
  function check(set, fn) {
    try {
      fn();
    } catch (error) {
      set('failed: ' + message(error), 'no');
    }
  }

  // ---- Anything that went wrong outside a check ----
  // Listening starts before the checks; the row is added at the bottom.

  var setPageErrors = null;
  var pageErrors = 0;
  var lastPageError = '';
  function showPageErrors() {
    if (!setPageErrors) return;
    if (pageErrors) setPageErrors(pageErrors + ', last: ' + lastPageError, 'no');
    else setPageErrors('none', 'wait');
  }
  function onPageError(text) {
    pageErrors++;
    lastPageError = text;
    showPageErrors();
  }
  window.addEventListener('error', function (event) {
    onPageError(event.message || 'error');
  });
  window.addEventListener('unhandledrejection', function (event) {
    onPageError(message(event.reason));
  });

  // ---- Header: version and a running clock ----

  var startedAt = Date.now();
  document.getElementById('version').textContent = 'version ' + VERSION;
  var clockEl = document.getElementById('clock');
  function showClock() {
    var now = new Date();
    var seconds = Math.round((now.getTime() - startedAt) / 1000);
    clockEl.textContent = now.toLocaleTimeString() + ', open for ' + seconds + ' s';
  }
  showClock();
  setInterval(showClock, 1000);

  // ---- Browser ----

  var browser = section('Browser');
  var setUserAgent = row(browser, 'User agent', true);
  var setWindow = row(browser, 'Window size');
  var setScreen = row(browser, 'Screen size');
  var setRatio = row(browser, 'devicePixelRatio');
  var setSecure = row(browser, 'Secure context');

  check(setUserAgent, function () { setUserAgent(navigator.userAgent); });
  check(setSecure, function () { yesNo(setSecure, window.isSecureContext === true); });

  function showSizes() {
    check(setWindow, function () { setWindow(window.innerWidth + ' x ' + window.innerHeight); });
    check(setScreen, function () { setScreen(screen.width + ' x ' + screen.height); });
    check(setRatio, function () { setRatio(String(window.devicePixelRatio)); });
  }
  showSizes();
  window.addEventListener('resize', showSizes);

  // ---- Features ----

  var features = section('Features');
  function feature(label, test) {
    var set = row(features, label);
    check(set, function () { yesNo(set, test()); });
  }
  feature('VideoDecoder', function () { return 'VideoDecoder' in window; });
  feature('WebTransport', function () { return 'WebTransport' in window; });
  feature('RTCPeerConnection', function () { return 'RTCPeerConnection' in window; });
  feature('navigator.gpu', function () { return 'gpu' in navigator && !!navigator.gpu; });
  feature('Worker', function () { return 'Worker' in window; });
  feature('OffscreenCanvas', function () { return 'OffscreenCanvas' in window; });
  feature('WebGL2', function () { return !!document.createElement('canvas').getContext('webgl2'); });

  // ---- Decoder support per codec ----

  var support = section('Decoder support: hardware / any');

  function isSupported(entry, hardwareAcceleration) {
    return VideoDecoder.isConfigSupported({
      codec: entry.codec,
      codedWidth: entry.width,
      codedHeight: entry.height,
      hardwareAcceleration: hardwareAcceleration
    }).then(
      function (result) { return result.supported ? 'yes' : 'no'; },
      function (error) { return 'error (' + message(error) + ')'; }
    );
  }

  CODECS.forEach(function (entry) {
    var set = row(support, entry.label);
    if (!('VideoDecoder' in window)) {
      set('no VideoDecoder', 'no');
      return;
    }
    check(set, function () {
      Promise.all([
        isSupported(entry, 'prefer-hardware'),
        isSupported(entry, 'no-preference')
      ]).then(function (results) {
        set(results[0] + ' / ' + results[1], results[0] === 'yes' ? 'yes' : 'no');
      });
    });
  });

  // ---- Decode test: the built-in H.264 frame, decoded over and over ----

  var decode = section('Decode test');
  var canvas = document.createElement('canvas');
  var sample = window.PROBE_SAMPLE;
  canvas.width = sample ? sample.width : 1280;
  canvas.height = sample ? sample.height : 720;
  decode.appendChild(canvas);
  var setDecoder = row(decode, 'Decoder');
  var setFormat = row(decode, 'Decoded frame');
  var setDecoded = row(decode, 'Frames decoded');
  var setDrawn = row(decode, 'Canvas draws');
  var setDecodeError = row(decode, 'Decoder error', true);
  setFormat('none yet', 'wait');
  setDecodeError('none', 'wait');

  var context = canvas.getContext('2d');
  var latestFrame = null;   // decoded, waiting to be drawn
  var hasPicture = false;
  var submitted = 0;
  var decoded = 0;
  var drawn = 0;
  var decoderErrors = 0;
  var lastOutputAt = 0;
  var flushes = 0;
  var decoder = null;
  var sampleBytes = null;

  function drawCanvas() {
    // Re-armed first, so a failing draw cannot stop the counter.
    requestAnimationFrame(drawCanvas);
    drawn++;
    var frame = latestFrame;
    latestFrame = null;
    try {
      paintCanvas(frame);
    } finally {
      if (frame) frame.close();
    }
  }

  function paintCanvas(frame) {
    if (frame) {
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      hasPicture = true;
    } else if (!hasPicture) {
      context.fillStyle = '#203040';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    // The counter sits on the plain band of the sample picture.
    context.fillStyle = '#203040';
    context.fillRect(0, 262, canvas.width, 336);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 150px sans-serif';
    context.fillText('draw ' + drawn, canvas.width / 2, 350);
    context.font = 'bold 90px sans-serif';
    context.fillText('frame ' + decoded, canvas.width / 2, 510);
  }
  requestAnimationFrame(drawCanvas);

  // Rates are measured against the clock, so throttled timers do not hide a slowdown.
  var rateAt = performance.now();
  var rateDecoded = 0;
  var rateDrawn = 0;
  setInterval(function () {
    var now = performance.now();
    var seconds = (now - rateAt) / 1000;
    if (seconds <= 0) return;
    var decodeRate = (decoded - rateDecoded) / seconds;
    var drawRate = (drawn - rateDrawn) / seconds;
    rateAt = now;
    rateDecoded = decoded;
    rateDrawn = drawn;
    setDecoded(decoded + ' (' + decodeRate.toFixed(1) + ' per second' +
      (flushes ? ', ' + flushes + ' flushes needed' : '') + ')', decodeRate > 0 ? 'yes' : 'no');
    setDrawn(drawn + ' (' + drawRate.toFixed(1) + ' per second)', drawRate > 0 ? 'yes' : 'no');
  }, 1000);

  function onFrame(frame) {
    if (!formatShown) {
      formatShown = true;
      setFormat(frame.format + ', ' + frame.codedWidth + ' x ' + frame.codedHeight +
        ', first after ' + Math.round(performance.now() - decodeStartedAt) + ' ms', 'yes');
    }
    decoded++;
    lastOutputAt = performance.now();
    if (latestFrame) latestFrame.close();
    latestFrame = frame;
  }

  var decodeStartedAt = 0;
  var formatShown = false;

  function startDecoder(hardwareAcceleration, description) {
    var instance = new VideoDecoder({
      output: onFrame,
      error: function (error) { onDecoderError(instance, hardwareAcceleration, error); }
    });
    instance.configure({
      codec: sample.codec,
      codedWidth: sample.width,
      codedHeight: sample.height,
      hardwareAcceleration: hardwareAcceleration,
      optimizeForLatency: true
    });
    decoder = instance;
    submitted = decoded;
    formatShown = false;
    decodeStartedAt = lastOutputAt = performance.now();
    setDecoder(description, hardwareAcceleration === 'prefer-hardware' ? 'yes' : 'no');
  }

  function onDecoderError(instance, hardwareAcceleration, error) {
    if (instance !== decoder) return;
    decoder = null;
    decoderErrors++;
    setDecodeError(decoderErrors + ': ' + message(error) + ' (' + hardwareAcceleration + ')', 'no');
    if (hardwareAcceleration === 'prefer-hardware') {
      check(setDecoder, function () {
        startDecoder('no-preference', 'any (hardware decoder failed)');
      });
    } else {
      setDecoder('stopped after an error', 'no');
    }
  }

  function feedDecoder() {
    if (!decoder || decoder.state !== 'configured') return;
    var now = performance.now();
    var inDecoder = submitted - decoded;
    if (inDecoder >= MAX_FRAMES_IN_DECODER) {
      // Some decoders hold frames back until flushed.
      if (now - lastOutputAt > FLUSH_AFTER_SILENT_MS) {
        lastOutputAt = now;
        flushes++;
        var flushed = decoder;
        flushed.flush().then(function () {
          if (flushed === decoder) submitted = decoded;
        }, function () {});
      }
      return;
    }
    decoder.decode(new EncodedVideoChunk({
      type: 'key',
      timestamp: submitted * FRAME_INTERVAL_MS * 1000,
      data: sampleBytes
    }));
    submitted++;
  }

  check(setDecoder, function () {
    if (!('VideoDecoder' in window)) {
      setDecoder('no VideoDecoder', 'no');
      setDecoded('0', 'no');
      return;
    }
    if (!sample) {
      setDecoder('sample frame did not load', 'no');
      return;
    }
    var binary = atob(sample.base64);
    sampleBytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) sampleBytes[i] = binary.charCodeAt(i);

    isSupported(sample, 'prefer-hardware').then(function (hardware) {
      check(setDecoder, function () {
        if (hardware === 'yes') startDecoder('prefer-hardware', 'hardware');
        else startDecoder('no-preference', 'any (no hardware decoder)');
        setInterval(function () {
          check(setDecodeError, feedDecoder);
        }, FRAME_INTERVAL_MS);
      });
    });
  });

  // ---- Canvas low-latency hint ----

  var canvasSection = section('Canvas "desynchronized"');
  function desynchronized(label, type) {
    var set = row(canvasSection, label);
    check(set, function () {
      var probeContext = document.createElement('canvas').getContext(type, { desynchronized: true });
      if (!probeContext) {
        set('no ' + type + ' context', 'no');
        return;
      }
      var attributes = probeContext.getContextAttributes ? probeContext.getContextAttributes() : null;
      if (!attributes || !('desynchronized' in attributes)) {
        set('not reported', 'no');
        return;
      }
      yesNo(set, attributes.desynchronized === true);
    });
  }
  desynchronized('2D canvas', '2d');
  desynchronized('WebGL2 canvas', 'webgl2');

  // ---- Touch ----

  var touch = section('Touch');
  var setMaxTouchPoints = row(touch, 'maxTouchPoints');
  var setTouchesSeen = row(touch, 'Most fingers seen at once');
  var setPinch = row(touch, 'Pinch zooms the page');
  check(setMaxTouchPoints, function () { setMaxTouchPoints(String(navigator.maxTouchPoints)); });
  setTouchesSeen('0, touch with several fingers', 'wait');
  setPinch('pinch the page to find out', 'wait');

  var fingersSeen = 0;
  var zoomSeen = false;
  var initialRatio = window.devicePixelRatio;
  var activePointers = {};

  // A pinch may zoom the visual viewport or the whole page.
  function showPinch() {
    var scale = window.visualViewport ? window.visualViewport.scale : 1;
    var ratio = window.devicePixelRatio / initialRatio;
    if (scale !== 1 || ratio !== 1) zoomSeen = true;
    if (zoomSeen) {
      setPinch('yes (zoom now ' + (scale * ratio).toFixed(2) + ')', 'no');
    } else if (fingersSeen >= 2) {
      setPinch('not so far, keep pinching (' + fingersSeen + ' fingers seen)');
    }
  }

  function onFingers(count, source) {
    if (count > fingersSeen) {
      fingersSeen = count;
      setTouchesSeen(fingersSeen + ' (' + source + ' events)', fingersSeen >= 2 ? 'yes' : undefined);
    }
    showPinch();
  }

  function onTouch(event) {
    onFingers(event.touches.length, 'touch');
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (type) {
    document.addEventListener(type, onTouch, { passive: true });
  });

  // In case the browser delivers fingers as pointer events only.
  document.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse') return;
    activePointers[event.pointerId] = true;
    onFingers(Object.keys(activePointers).length, 'pointer');
  });
  function onPointerGone(event) {
    delete activePointers[event.pointerId];
  }
  document.addEventListener('pointerup', onPointerGone);
  document.addEventListener('pointercancel', onPointerGone);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', showPinch);
  }
  window.addEventListener('resize', showPinch);

  // ---- Checks that need a tap ----

  var taps = section('Tap to test');

  var setFullscreen;
  button(taps, 'Fullscreen', function () {
    check(setFullscreen, function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
      }
      var root = document.documentElement;
      if (!root.requestFullscreen) {
        setFullscreen('no requestFullscreen', 'no');
        return;
      }
      setFullscreen('asking', 'wait');
      root.requestFullscreen().then(function () {
        fullscreenWorked = true;
        showFullscreen();
      }, function (error) {
        setFullscreen('refused: ' + message(error), 'no');
      });
    });
  });
  setFullscreen = row(taps, 'requestFullscreen()');
  setFullscreen('tap the button', 'wait');
  var fullscreenWorked = false;
  function showFullscreen() {
    if (!fullscreenWorked) return;
    setFullscreen(document.fullscreenElement ? 'yes, tap again to leave' : 'yes, it worked', 'yes');
  }
  document.addEventListener('fullscreenchange', showFullscreen);

  var setLocation;
  button(taps, 'Location', function () {
    check(setLocation, function () {
      if (!navigator.geolocation) {
        setLocation('no geolocation', 'no');
        return;
      }
      setLocation('asking', 'wait');
      navigator.geolocation.getCurrentPosition(function (position) {
        // The position itself is left out so photographs do not show it.
        setLocation('granted (accurate to ' + Math.round(position.coords.accuracy) + ' m)', 'yes');
      }, function (error) {
        var detail = error.message || 'code ' + error.code;
        if (error.code === error.PERMISSION_DENIED) setLocation('no: ' + detail, 'no');
        else setLocation('not refused, but no position: ' + detail);
      }, { timeout: LOCATION_TIMEOUT_MS });
    });
  });
  setLocation = row(taps, 'Location');
  check(setLocation, function () {
    if (!navigator.permissions) {
      setLocation('tap the button', 'wait');
      return;
    }
    navigator.permissions.query({ name: 'geolocation' }).then(function (status) {
      setLocation('permission is "' + status.state + '", tap the button', 'wait');
    }, function () {
      setLocation('tap the button', 'wait');
    });
  });

  // ---- Dark mode ----

  var dark = section('Dark mode');
  var setScheme = row(dark, 'prefers-color-scheme');
  var setSchemeChanges = row(dark, 'Changes since load');
  check(setScheme, function () {
    var query = window.matchMedia('(prefers-color-scheme: dark)');
    var changes = 0;
    function show() { setScheme(query.matches ? 'dark' : 'light'); }
    show();
    setSchemeChanges('0', 'wait');
    function onChange() {
      changes++;
      show();
      setSchemeChanges(changes + ' (last at ' + new Date().toLocaleTimeString() + ')', 'yes');
    }
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener(onChange);
  });

  // ---- Service worker ----

  var worker = section('Service worker');
  var setWorker = row(worker, 'Registers');
  check(setWorker, function () {
    if (!('serviceWorker' in navigator)) {
      setWorker('no serviceWorker', 'no');
      return;
    }
    navigator.serviceWorker.register('sw.js').then(function (registration) {
      setWorker('yes', 'yes');
      // Nothing here needs it afterwards.
      registration.unregister();
    }, function (error) {
      setWorker('no: ' + message(error), 'no');
    });
  });

  // ---- Page errors, shown last ----

  setPageErrors = row(section('Page errors'), 'Uncaught', true);
  showPageErrors();
})();

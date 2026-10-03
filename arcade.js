(() => {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const random = (min, max) => min + Math.random() * (max - min);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const smoothstep = value => value * value * (3 - 2 * value);
  const MAX_LEVEL = 28;
  const PLAYER_FIRE_DELAY_SCALE = 1.4;

  // Rare light fragments travelling strictly along the 64px page grid.
  const runnerCanvas = document.querySelector('#grid-runners');
  if (runnerCanvas) {
    const runnerContext = runnerCanvas.getContext('2d');
    let runnerWidth = 0;
    let runnerHeight = 0;
    let runnerDpr = 1;
    let nextRunner = 180;
    let firstRunnerBurst = true;
    let runnerLast = performance.now();
    const runners = [];

    function sizeRunnerCanvas() {
      runnerDpr = Math.min(devicePixelRatio || 1, 2);
      const bounds = runnerCanvas.getBoundingClientRect();
      runnerWidth = bounds.width;
      runnerHeight = bounds.height;
      runnerCanvas.width = Math.round(runnerWidth * runnerDpr);
      runnerCanvas.height = Math.round(runnerHeight * runnerDpr);
      runnerContext.setTransform(runnerDpr, 0, 0, runnerDpr, 0, 0);
    }

    function spawnRunner() {
      if (runners.length >= 5) return;
      const horizontal = Math.random() < .58;
      const fadeLimit = runnerHeight * .76;
      const lineCount = Math.max(1, Math.floor((horizontal ? fadeLimit : runnerWidth) / 64));
      const forward = Math.random() < .5;
      const travelLimit = horizontal ? runnerWidth : fadeLimit;
      const travel = Math.min(random(110, 260), travelLimit * .38);
      const available = Math.max(1, travelLimit - travel - 32);
      const travelStart = 16 + Math.random() * available;
      runners.push({
        horizontal,
        line: Math.floor(Math.pow(Math.random(), 1.65) * (lineCount + 1)) * 64 + (horizontal ? .5 : 1),
        length: random(74, 128),
        start: forward ? travelStart : travelStart + travel,
        end: forward ? travelStart + travel : travelStart,
        age: 0,
        duration: random(2400, 3800),
        hue: Math.random() < .65 ? 188 : Math.random() < .5 ? 275 : 47,
      });
    }

    function drawRunners(now) {
      const elapsed = Math.min(50, now - runnerLast);
      runnerLast = now;
      runnerContext.clearRect(0, 0, runnerWidth, runnerHeight);
      nextRunner -= elapsed;
      if (nextRunner <= 0) {
        spawnRunner();
        if (firstRunnerBurst || Math.random() < .16) spawnRunner();
        firstRunnerBurst = false;
        nextRunner = random(900, 2200);
      }

      for (let index = runners.length - 1; index >= 0; index -= 1) {
        const ray = runners[index];
        ray.age += elapsed;
        const progress = ray.age / ray.duration;
        if (progress >= 1) {
          runners.splice(index, 1);
          continue;
        }
        const center = lerp(ray.start, ray.end, progress);
        const y = ray.horizontal ? ray.line : center;
        const gridFade = clamp(1 - y / (runnerHeight * .77), 0, 1);
        const fadeIn = smoothstep(clamp(progress / .2, 0, 1));
        const fadeOut = smoothstep(clamp((1 - progress) / .34, 0, 1));
        const lifeFade = fadeIn * fadeOut;
        const alpha = gridFade * lifeFade;
        if (alpha <= .01) continue;

        const stretch = .34 + smoothstep(clamp(progress / .72, 0, 1)) * .9;
        const visibleLength = ray.length * stretch;
        const x1 = ray.horizontal ? center - visibleLength / 2 : ray.line;
        const y1 = ray.horizontal ? ray.line : center - visibleLength / 2;
        const x2 = ray.horizontal ? center + visibleLength / 2 : ray.line;
        const y2 = ray.horizontal ? ray.line : center + visibleLength / 2;
        const gradient = runnerContext.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `hsla(${ray.hue},100%,72%,0)`);
        gradient.addColorStop(.3, `hsla(${ray.hue},100%,78%,${alpha * .58})`);
        gradient.addColorStop(.72, `hsla(${ray.hue},100%,92%,${alpha})`);
        gradient.addColorStop(1, `hsla(${ray.hue},100%,72%,0)`);
        runnerContext.save();
        runnerContext.globalCompositeOperation = 'lighter';
        runnerContext.strokeStyle = gradient;
        runnerContext.lineWidth = 1.9;
        runnerContext.shadowColor = `hsla(${ray.hue},100%,70%,${alpha})`;
        runnerContext.shadowBlur = 18;
        runnerContext.beginPath();
        runnerContext.moveTo(x1, y1);
        runnerContext.lineTo(x2, y2);
        runnerContext.stroke();
        runnerContext.shadowBlur = 0;
        runnerContext.lineWidth = .7;
        runnerContext.stroke();
        runnerContext.restore();
      }
      requestAnimationFrame(drawRunners);
    }

    sizeRunnerCanvas();
    addEventListener('resize', sizeRunnerCanvas, { passive: true });
    requestAnimationFrame(drawRunners);
  }

  const canvas = document.querySelector('#galactica');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const colors = ['#7ef9ff', '#ff62c6', '#ffd35a'];
  let width = 900;
  let height = 480;
  let dpr = 1;
  let lastTime = performance.now();
  let elapsedTime = 0;
  let mode = 'ready';
  let level = 1;
  let score = 0;
  let formationTime = 0;
  let enemyShotClock = 1;
  let banner = null;
  let transitionClock = 0;
  let screenShake = 0;
  let pointerActive = false;
  let keyboardFire = false;
  const keys = new Set();

  let enemies = [];
  let playerShots = [];
  let enemyShots = [];
  let crates = [];
  let particles = [];
  let shockwaves = [];
  let stars = [];

  const player = {
    x: 450,
    y: 420,
    targetX: 450,
    lives: 3,
    helpers: 0,
    shields: 0,
    weapon: 'twin',
    weaponTime: 0,
    shotClock: 0,
    helperClock: 0,
    cannonSide: -1,
    invulnerable: 0,
  };

  function makeBanner(text, sub, duration = Infinity) {
    return { text, sub, time: duration, duration, age: 0 };
  }

  function resizeGame() {
    const bounds = canvas.getBoundingClientRect();
    const previousWidth = width;
    width = Math.max(280, bounds.width);
    height = Math.max(340, bounds.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (previousWidth) {
      player.x = clamp(player.x * width / previousWidth, 28, width - 28);
      player.targetX = player.x;
    }
    player.y = height - 58;
    makeStars();
    if ((mode === 'ready' || mode === 'playing' || mode === 'transition') && enemies.length) positionFormation();
  }

  function makeStars() {
    const count = Math.round(width * height / 7200);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() < .1 ? 1.5 : random(.35, 1),
      alpha: random(.16, .62),
      phase: random(0, Math.PI * 2),
    }));
  }

  function resetGame() {
    level = 1;
    score = 0;
    player.lives = 3;
    player.helpers = 0;
    player.shields = 0;
    player.weapon = 'twin';
    player.weaponTime = 0;
    player.invulnerable = 0;
    player.x = width / 2;
    player.targetX = player.x;
    playerShots = [];
    enemyShots = [];
    crates = [];
    particles = [];
    shockwaves = [];
    mode = 'playing';
    startLevel();
  }

  function engageGame() {
    if (mode === 'ready') {
      mode = 'playing';
      enemyShotClock = .8;
      banner = makeBanner('LEVEL 1', 'SECTOR 01 ONLINE', 1.65);
    } else if (mode === 'gameover' || mode === 'win') {
      resetGame();
    }
  }

  function startLevel() {
    formationTime = 0;
    enemyShotClock = Math.max(.34, 1.32 - level * .052);
    transitionClock = 0;
    playerShots = [];
    enemyShots = [];
    crates = [];
    spawnFormation();
    banner = makeBanner(`LEVEL ${level}`, level === MAX_LEVEL ? 'FINAL SECTOR // MAXIMUM THREAT' : `SECTOR ${String(level).padStart(2, '0')} ONLINE`, 1.9);
  }

  function spawnFormation() {
    enemies = [];
    const rows = level < 3 ? 2 : level < 16 ? 3 : 4;
    const largestRow = clamp(Math.floor((width - 56) / 68), 4, 9);
    for (let row = 0; row < rows; row += 1) {
      const count = clamp(largestRow - (rows - 1 - row) * 2, 2, largestRow);
      for (let column = 0; column < count; column += 1) {
        const hp = 1 + Math.min(5, Math.floor((level - 1) / 5)) + (level >= 12 && row === 0 ? 1 : 0);
        const satelliteChance = level >= 6 ? Math.min(.72, .08 + level * .022) : 0;
        let satellites = 0;
        if (Math.random() < satelliteChance) {
          satellites = 1;
          if (level >= 14 && Math.random() < .46) satellites += 1;
          if (level >= 23 && Math.random() < .34) satellites += 1;
        }
        const weaponRoll = Math.random();
        const rocketChance = level >= 18 ? Math.min(.16, .045 + (level - 18) * .011) : 0;
        const laserChance = level >= 12 ? Math.min(.24, .07 + (level - 12) * .012) : 0;
        const weapon = weaponRoll < rocketChance ? 'rocket' : weaponRoll < rocketChance + laserChance ? 'laser' : 'bolt';
        enemies.push({
          row,
          column,
          count,
          baseX: 0,
          baseY: 82 + row * 57,
          x: 0,
          y: 0,
          hp,
          maxHp: hp,
          size: 16 + row * 2,
          type: row % 3,
          color: colors[row % colors.length],
          phase: random(0, Math.PI * 2) + column * .34,
          satellites,
          weapon,
          hit: 0,
          alive: true,
        });
      }
    }
    positionFormation();
  }

  function positionFormation() {
    const spacing = Math.min(70, (width - 52) / Math.max(4, Math.max(...enemies.map(enemy => enemy.count))));
    for (const enemy of enemies) {
      enemy.baseX = width / 2 + (enemy.column - (enemy.count - 1) / 2) * spacing;
      enemy.x = enemy.baseX;
      enemy.y = enemy.baseY;
    }
  }

  function pointerX(event) {
    const bounds = canvas.getBoundingClientRect();
    return clamp(event.clientX - bounds.left, 26, width - 26);
  }

  canvas.addEventListener('pointerdown', event => {
    engageGame();
    if (mode !== 'playing' && mode !== 'transition') return;
    pointerActive = true;
    player.targetX = pointerX(event);
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointerActive || (mode !== 'playing' && mode !== 'transition')) return;
    player.targetX = pointerX(event);
    event.preventDefault();
  });
  const releasePointer = () => {
    pointerActive = false;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  addEventListener('keydown', event => {
    if (event.code === 'Space') engageGame();
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && (mode === 'playing' || mode === 'transition')) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space') keyboardFire = true;
  });
  addEventListener('keyup', event => {
    keys.delete(event.code);
    if (event.code === 'Space') keyboardFire = false;
  });
  function addShot(x, y, options = {}) {
    playerShots.push({
      x,
      y,
      vx: options.vx || 0,
      vy: options.vy || -620,
      width: options.width || 2,
      height: options.height || 13,
      damage: options.damage || 1,
      color: options.color || '#7ef9ff',
      type: options.type || 'bolt',
      hitsRemaining: options.hitsRemaining ?? 1,
      alive: true,
    });
  }

  function firePlayer() {
    if (player.weapon === 'laser') {
      addShot(player.x - 10, player.y - 20, { width: 3, height: 66, vy: -760, damage: 1, color: '#ff72e8', type: 'laser', hitsRemaining: 2 });
      addShot(player.x + 10, player.y - 20, { width: 3, height: 66, vy: -760, damage: 1, color: '#ff72e8', type: 'laser', hitsRemaining: 2 });
      player.shotClock = .34 * PLAYER_FIRE_DELAY_SCALE;
    } else if (player.weapon === 'rocket') {
      addShot(player.x, player.y - 24, { width: 5, height: 15, vy: -285, damage: 3, color: '#ffb14b', type: 'rocket' });
      player.shotClock = .62 * PLAYER_FIRE_DELAY_SCALE;
    } else {
      player.cannonSide *= -1;
      addShot(player.x + player.cannonSide * 11, player.y - 21, { color: player.cannonSide > 0 ? '#7ef9ff' : '#d9feff' });
      player.shotClock = .145 * PLAYER_FIRE_DELAY_SCALE;
    }
  }

  function fireHelpers() {
    if (!player.helpers) return;
    for (let index = 0; index < player.helpers; index += 1) {
      const angle = elapsedTime * 1.8 + index * Math.PI * 2 / player.helpers;
      addShot(player.x + Math.cos(angle) * 35, player.y + Math.sin(angle) * 18, { width: 2, height: 9, vy: -520, color: '#b7ff68' });
    }
  }

  function fireEnemy() {
    const living = enemies.filter(enemy => enemy.alive);
    if (!living.length) return;
    const shooter = living[Math.floor(Math.random() * living.length)];
    const speed = 145 + Math.min(level, 24) * 10;
    const aim = clamp((player.x - shooter.x) / Math.max(150, player.y - shooter.y), -.48, .48);
    if (shooter.weapon === 'laser') {
      enemyShots.push({ x: shooter.x, y: shooter.y + 34, vx: aim * speed * .72, vy: speed * .82, radius: 4, length: 62, type: 'laser', color: '#ff67dc', alive: true });
      return;
    }
    if (shooter.weapon === 'rocket') {
      enemyShots.push({ x: shooter.x, y: shooter.y + 20, vx: aim * 80, vy: 108 + level * 2.2, radius: 6, type: 'rocket', color: '#ff9a47', alive: true });
      return;
    }
    const sideSpeed = 46 + level * 2;
    enemyShots.push({ x: shooter.x, y: shooter.y + 15, vx: aim * speed, vy: speed, radius: level >= 20 ? 4.1 : level >= 8 ? 3.6 : 3, type: 'bolt', color: shooter.color, alive: true });
    const spreadChance = level >= 8 ? Math.min(.64, .2 + (level - 8) * .022) : 0;
    if (Math.random() < spreadChance) {
      enemyShots.push({ x: shooter.x, y: shooter.y + 15, vx: aim * speed - sideSpeed, vy: speed * .94, radius: 2.7, type: 'bolt', color: shooter.color, alive: true });
      enemyShots.push({ x: shooter.x, y: shooter.y + 15, vx: aim * speed + sideSpeed, vy: speed * .94, radius: 2.7, type: 'bolt', color: shooter.color, alive: true });
    }
    const wideChance = level >= 18 ? Math.min(.38, .16 + (level - 18) * .018) : 0;
    if (Math.random() < wideChance) {
      enemyShots.push({ x: shooter.x, y: shooter.y + 15, vx: aim * speed - sideSpeed * 2, vy: speed * .86, radius: 2.4, type: 'bolt', color: shooter.color, alive: true });
      enemyShots.push({ x: shooter.x, y: shooter.y + 15, vx: aim * speed + sideSpeed * 2, vy: speed * .86, radius: 2.4, type: 'bolt', color: shooter.color, alive: true });
    }
  }

  function burst(x, y, color, amount = 10, force = 1) {
    for (let index = 0; index < amount; index += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(25, 115) * force;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: random(.28, .8), maxLife: .8, color, size: random(1, 3) });
    }
  }

  function damageEnemy(enemy, amount, hitX, hitY) {
    if (!enemy.alive) return;
    if (enemy.satellites > 0) {
      enemy.satellites -= 1;
      burst(hitX, hitY, '#d990ff', 9, .8);
      enemy.hit = .12;
      return;
    }
    enemy.hp -= amount;
    enemy.hit = .1;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      score += 100 * level;
      screenShake = Math.min(7, screenShake + 2.4);
      burst(enemy.x, enemy.y, enemy.color, 15, 1.25);
      maybeDropCrate(enemy.x, enemy.y);
    }
  }

  function maybeDropCrate(x, y) {
    if (Math.random() > .105 + level * .002) return;
    const roll = Math.random();
    let type;
    if (level >= 3 && roll < .14) type = 'bomb';
    else if (roll < .32) type = 'helper';
    else if (roll < .49) type = 'shield';
    else if (roll < .67) type = 'laser';
    else if (roll < .84) type = 'rocket';
    else type = 'heart';
    crates.push({ x, y, type, vy: 72, angle: 0, alive: true });
  }

  function collectCrate(crate) {
    crate.alive = false;
    const crateColors = { helper: '#b7ff68', shield: '#c388ff', laser: '#ff72e8', rocket: '#ffb14b', heart: '#ff6687', bomb: '#ff4040' };
    burst(crate.x, crate.y, crateColors[crate.type], 13, 1);
    if (crate.type === 'bomb') {
      damagePlayer(true);
    } else if (crate.type === 'helper') {
      if (player.helpers < 3) player.helpers += 1;
      else score += 500;
    } else if (crate.type === 'shield') {
      if (player.shields < 3) player.shields += 1;
      else score += 500;
    } else if (crate.type === 'heart') {
      if (player.lives < 5) player.lives += 1;
      else score += 500;
    } else {
      player.weapon = crate.type;
      player.weaponTime = 13;
      player.shotClock = 0;
    }
  }

  function damagePlayer(ignoreShield = false) {
    if (player.invulnerable > 0 || (mode !== 'playing' && mode !== 'transition')) return;
    if (!ignoreShield && player.shields > 0) {
      player.shields -= 1;
      player.invulnerable = .45;
      burst(player.x, player.y, '#c388ff', 13, 1.2);
      screenShake = 4;
      return;
    }
    if (player.helpers > 0) {
      const helperIndex = player.helpers - 1;
      const helperAngle = elapsedTime * 1.8 + helperIndex * Math.PI * 2 / player.helpers;
      const helperX = player.x + Math.cos(helperAngle) * 35;
      const helperY = player.y + Math.sin(helperAngle) * 18;
      player.helpers -= 1;
      burst(helperX, helperY, '#b7ff68', 14, 1.25);
    }
    player.lives -= 1;
    player.invulnerable = 1.5;
    burst(player.x, player.y, '#ff6687', 22, 1.6);
    screenShake = 8;
    if (player.lives <= 0) {
      mode = 'gameover';
      pointerActive = false;
      canvas.classList.remove('is-dragging');
      keyboardFire = false;
      banner = makeBanner('GAME OVER', `REACHED LEVEL ${level} // SIGNAL LOST`);
    }
  }

  function explodeRocket(shot) {
    shot.alive = false;
    burst(shot.x, shot.y, '#ffb14b', 24, 1.5);
    shockwaves.push({ x: shot.x, y: shot.y, life: .58, maxLife: .58, startRadius: 7, endRadius: 82, color: '#ffbf66', glow: '#ff7a3d' });
    screenShake = Math.min(8, screenShake + 3);
    for (const enemy of enemies) {
      if (enemy.alive && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < 72) damageEnemy(enemy, 3, enemy.x, enemy.y);
    }
  }

  function explodeEnemyRocket(shot) {
    shot.alive = false;
    burst(shot.x, shot.y, '#ff704d', 18, 1.25);
    shockwaves.push({ x: shot.x, y: shot.y, life: .48, maxLife: .48, startRadius: 5, endRadius: 46, color: '#ff8266', glow: '#ff3f45' });
    screenShake = Math.min(8, screenShake + 2.5);
  }

  function updateEnemies(delta, passive = false) {
    formationTime += delta;
    const sway = Math.sin(formationTime * (.7 + level * .025)) * Math.min(74, width * .075);
    const arcStrength = level >= 4 ? Math.min(82, (level - 3) * 7) : 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const arc = Math.sin(formationTime * (.76 + level * .018) + enemy.phase);
      const dive = level >= 7 ? Math.max(0, Math.sin(formationTime * .48 + enemy.phase) - .72) * (175 + level * 7) : 0;
      enemy.x = clamp(enemy.baseX + sway + arc * arcStrength, 22, width - 22);
      enemy.y = enemy.baseY + (1 - Math.cos(formationTime * .7 + enemy.phase)) * (level >= 4 ? 8 : 2) + dive;
      enemy.hit = Math.max(0, enemy.hit - delta);
      if (!passive && enemy.y > player.y - 25 && Math.abs(enemy.x - player.x) < 27) {
        enemy.alive = false;
        damagePlayer();
        burst(enemy.x, enemy.y, enemy.color, 14, 1.3);
      }
    }

    enemyShotClock -= delta;
    if (!passive && enemyShotClock <= 0) {
      fireEnemy();
      const shotPace = level <= 10 ? 1 - level * .067 : .33 - (level - 10) * .008;
      enemyShotClock = random(.72, 1.18) * Math.max(.18, shotPace);
    }
  }

  function updatePlayer(delta, allowFire = true) {
    if (keys.has('ArrowLeft')) player.targetX -= 330 * delta;
    if (keys.has('ArrowRight')) player.targetX += 330 * delta;
    player.targetX = clamp(player.targetX, 27, width - 27);
    player.x = lerp(player.x, player.targetX, 1 - Math.pow(.0004, delta));
    player.y = height - 58;
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.shotClock -= delta;
    player.helperClock -= delta;
    if (player.weapon !== 'twin') {
      player.weaponTime -= delta;
      if (player.weaponTime <= 0) player.weapon = 'twin';
    }
    if (allowFire && (pointerActive || keyboardFire) && player.shotClock <= 0) firePlayer();
    if (allowFire && player.helpers && player.helperClock <= 0) {
      fireHelpers();
      player.helperClock = .82 * PLAYER_FIRE_DELAY_SCALE;
    }
  }

  function updateShots(delta) {
    for (const shot of playerShots) {
      if (!shot.alive) continue;
      if (shot.type === 'rocket') {
        let target = null;
        let nearest = Infinity;
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const range = distance(shot, enemy);
          if (range < nearest) { nearest = range; target = enemy; }
        }
        if (target) {
          shot.vx = lerp(shot.vx, clamp((target.x - shot.x) * 2.2, -150, 150), 1 - Math.pow(.04, delta));
          if (nearest < 37) { explodeRocket(shot); continue; }
        }
      }
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
      if (shot.y + shot.height < -20 || shot.x < -40 || shot.x > width + 40) { shot.alive = false; continue; }
      if (shot.type === 'rocket') continue;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (Math.abs(shot.x - enemy.x) < enemy.size + shot.width && Math.abs(shot.y - enemy.y) < enemy.size + shot.height / 2) {
          damageEnemy(enemy, shot.damage, shot.x, shot.y);
          shot.hitsRemaining -= 1;
          if (shot.hitsRemaining <= 0) { shot.alive = false; break; }
        }
      }
    }

    for (const shot of enemyShots) {
      if (!shot.alive) continue;
      if (shot.type === 'rocket') {
        const desiredVelocity = clamp((player.x - shot.x) * 1.35, -125, 125);
        shot.vx = lerp(shot.vx, desiredVelocity, 1 - Math.pow(.12, delta));
      }
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
      if (shot.y > height + 20 || shot.x < -20 || shot.x > width + 20) { shot.alive = false; continue; }
      let shielded = false;
      const shotHalfLength = shot.type === 'laser' ? shot.length / 2 : 0;
      for (let index = 0; index < player.shields; index += 1) {
        const angle = -elapsedTime * 2.2 + index * Math.PI * 2 / player.shields;
        const shield = { x: player.x + Math.cos(angle) * 43, y: player.y + Math.sin(angle) * 22 };
        if (Math.abs(shot.x - shield.x) < 12 + shot.radius && Math.abs(shot.y - shield.y) < 12 + shot.radius + shotHalfLength) {
          player.shields -= 1;
          if (shot.type === 'rocket') explodeEnemyRocket(shot);
          else shot.alive = false;
          shielded = true;
          burst(shield.x, shield.y, '#c388ff', 12, 1);
          break;
        }
      }
      if (!shielded && shot.alive && Math.abs(shot.x - player.x) < 20 + shot.radius && Math.abs(shot.y - player.y) < 18 + shotHalfLength) {
        if (shot.type === 'rocket') explodeEnemyRocket(shot);
        else shot.alive = false;
        damagePlayer();
      }
    }
    playerShots = playerShots.filter(shot => shot.alive);
    enemyShots = enemyShots.filter(shot => shot.alive);
  }

  function updateCrates(delta) {
    for (const crate of crates) {
      if (!crate.alive) continue;
      crate.y += crate.vy * delta;
      crate.angle += delta * 1.4;
      if (crate.y > height + 20) crate.alive = false;
      else if (Math.abs(crate.x - player.x) < 25 && Math.abs(crate.y - player.y) < 23) collectCrate(crate);
    }
    crates = crates.filter(crate => crate.alive);
  }

  function updateParticles(delta) {
    for (const particle of particles) {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(.04, delta);
      particle.vy *= Math.pow(.04, delta);
    }
    particles = particles.filter(particle => particle.life > 0);
    for (const wave of shockwaves) wave.life -= delta;
    shockwaves = shockwaves.filter(wave => wave.life > 0);
  }

  function update(delta) {
    elapsedTime += delta;
    screenShake = Math.max(0, screenShake - delta * 22);
    if (banner) {
      banner.age += delta;
      if (Number.isFinite(banner.time)) banner.time = Math.max(0, banner.time - delta);
    }
    updateParticles(delta);

    if (mode === 'ready') {
      updateEnemies(delta, true);
    } else if (mode === 'playing') {
      updatePlayer(delta);
      updateEnemies(delta);
      updateShots(delta);
      updateCrates(delta);
      if (!enemies.some(enemy => enemy.alive)) {
        mode = 'transition';
        transitionClock = 1.8;
        banner = makeBanner(
          level === MAX_LEVEL ? 'YOU WIN' : `LEVEL ${level} CLEAR`,
          level === MAX_LEVEL ? 'CONGRATULATIONS // ALL SECTORS CLEAR' : 'PREPARING NEXT SECTOR',
          level === MAX_LEVEL ? Infinity : 1.8,
        );
      }
    } else if (mode === 'transition') {
      transitionClock -= delta;
      updatePlayer(delta, false);
      updateShots(delta);
      updateCrates(delta);
      if (mode !== 'transition') return;
      if (transitionClock <= 0) {
        if (level >= MAX_LEVEL) {
          mode = 'win';
          score += player.lives * 1500;
        } else {
          level += 1;
          mode = 'playing';
          startLevel();
        }
      }
    }
  }

  function polygon(points, fill, stroke = null, lineWidth = 1) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0], points[index][1]);
    context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
  }

  function drawBackground() {
    for (const star of stars) {
      context.globalAlpha = star.alpha * (.72 + Math.sin(elapsedTime * 1.4 + star.phase) * .28);
      context.fillStyle = '#dffbff';
      context.fillRect(star.x, star.y, star.size, star.size);
    }
    context.globalAlpha = 1;
  }

  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    context.save();
    context.translate(enemy.x, enemy.y);
    context.shadowColor = enemy.color;
    context.shadowBlur = enemy.hit > 0 ? 20 : 9;
    const color = enemy.hit > 0 ? '#ffffff' : enemy.color;
    const size = enemy.size;
    if (enemy.type === 0) {
      polygon([[0, -size], [size * .95, size * .65], [size * .34, size * .34], [0, size * .72], [-size * .34, size * .34], [-size * .95, size * .65]], color);
      polygon([[-size * .34, -1], [size * .34, -1], [size * .18, size * .3], [-size * .18, size * .3]], '#090614');
    } else if (enemy.type === 1) {
      polygon([[-size, size * .55], [-size * .58, -size * .58], [0, -size], [size * .58, -size * .58], [size, size * .55], [size * .34, size * .25], [-size * .34, size * .25]], color);
      context.fillStyle = '#090614';
      context.fillRect(-size * .36, -size * .38, size * .72, size * .3);
    } else {
      polygon([[0, -size], [size, 0], [size * .48, size * .72], [0, size * .35], [-size * .48, size * .72], [-size, 0]], color);
      polygon([[0, -size * .48], [size * .35, 0], [0, size * .28], [-size * .35, 0]], '#090614');
    }
    if (enemy.weapon === 'laser') {
      context.fillStyle = '#ff67dc';
      context.shadowColor = '#ff67dc';
      context.shadowBlur = 8;
      context.fillRect(-5, size * .42, 10, 2);
    } else if (enemy.weapon === 'rocket') {
      polygon([[-4, size * .35], [4, size * .35], [0, size * .78]], '#ff9a47');
    }
    if (enemy.hp < enemy.maxHp) {
      context.fillStyle = '#ffffffcc';
      context.fillRect(-size, size + 5, size * 2 * enemy.hp / enemy.maxHp, 1.5);
    }
    for (let index = 0; index < enemy.satellites; index += 1) {
      const angle = elapsedTime * 2.4 + index * Math.PI * 2 / enemy.satellites;
      const sx = Math.cos(angle) * (size + 11);
      const sy = Math.sin(angle) * 9;
      context.save();
      context.translate(sx, sy);
      context.rotate(elapsedTime * 4 + index);
      polygon([[0, -5], [5, 0], [0, 5], [-5, 0]], '#d990ff');
      context.restore();
    }
    context.restore();
  }

  function drawPlayer() {
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    context.save();
    context.translate(player.x, player.y);
    context.shadowColor = '#7ef9ff';
    context.shadowBlur = 14;
    polygon([[0, -22], [18, 13], [8, 9], [0, 16], [-8, 9], [-18, 13]], '#dffeff');
    polygon([[0, -12], [7, 8], [0, 5], [-7, 8]], '#5b56ff');
    context.fillStyle = '#7ef9ff';
    context.fillRect(-15, -3, 3, 22);
    context.fillRect(12, -3, 3, 22);
    context.fillStyle = '#ff62c6';
    context.fillRect(-5, 15, 3, random(4, 10));
    context.fillRect(2, 15, 3, random(4, 10));

    for (let index = 0; index < player.helpers; index += 1) {
      const angle = elapsedTime * 1.8 + index * Math.PI * 2 / player.helpers;
      const hx = Math.cos(angle) * 35;
      const hy = Math.sin(angle) * 18;
      context.save();
      context.translate(hx, hy);
      context.fillStyle = '#b7ff68';
      context.beginPath();
      context.arc(0, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f4ffe5';
      context.fillRect(-1, -8, 2, 7);
      context.restore();
    }
    for (let index = 0; index < player.shields; index += 1) {
      const angle = -elapsedTime * 2.2 + index * Math.PI * 2 / player.shields;
      context.save();
      context.translate(Math.cos(angle) * 43, Math.sin(angle) * 22);
      context.rotate(elapsedTime * 4 + index);
      polygon([[0, -7], [7, 0], [0, 7], [-7, 0]], '#c388ff');
      context.restore();
    }
    context.restore();

    const heartY = Math.min(height - 12, player.y + 33);
    const totalWidth = player.lives * 13;
    for (let index = 0; index < player.lives; index += 1) drawHeart(player.x - totalWidth / 2 + index * 13 + 6, heartY, 4.4, '#ff6687');
  }

  function drawHeart(x, y, size, color) {
    context.save();
    context.translate(x, y);
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, size * 1.7);
    context.bezierCurveTo(-size * 2, size * .35, -size * 1.35, -size, 0, -.2 * size);
    context.bezierCurveTo(size * 1.35, -size, size * 2, size * .35, 0, size * 1.7);
    context.fill();
    context.restore();
  }

  function drawShots() {
    for (const shot of playerShots) {
      context.save();
      context.fillStyle = shot.color;
      context.shadowColor = shot.color;
      context.shadowBlur = shot.type === 'laser' ? 14 : 7;
      if (shot.type === 'rocket') {
        polygon([[shot.x, shot.y - 8], [shot.x + 4, shot.y + 5], [shot.x, shot.y + 2], [shot.x - 4, shot.y + 5]], shot.color);
        context.fillStyle = '#ff5a45';
        context.fillRect(shot.x - 1, shot.y + 5, 2, random(5, 10));
      } else {
        context.fillRect(shot.x - shot.width / 2, shot.y - shot.height / 2, shot.width, shot.height);
      }
      context.restore();
    }
    for (const shot of enemyShots) {
      context.save();
      context.fillStyle = shot.color;
      context.shadowColor = shot.color;
      context.shadowBlur = shot.type === 'laser' ? 15 : 9;
      if (shot.type === 'laser') {
        context.fillRect(shot.x - 2, shot.y - shot.length / 2, 4, shot.length);
        context.fillStyle = '#fff1fc';
        context.fillRect(shot.x - .6, shot.y - shot.length / 2, 1.2, shot.length);
      } else if (shot.type === 'rocket') {
        polygon([[shot.x, shot.y + 8], [shot.x + 4, shot.y - 5], [shot.x, shot.y - 2], [shot.x - 4, shot.y - 5]], shot.color);
        context.fillStyle = '#ffdf73';
        context.fillRect(shot.x - 1, shot.y - random(10, 15), 2, random(5, 9));
      } else {
        context.beginPath();
        context.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  function drawCrates() {
    const crateColors = { helper: '#b7ff68', shield: '#c388ff', laser: '#ff72e8', rocket: '#ffb14b', heart: '#ff6687', bomb: '#ff4040' };
    const crateMarks = { helper: '●', shield: '◇', laser: 'L', rocket: 'R', heart: '♥', bomb: '×' };
    for (const crate of crates) {
      context.save();
      context.translate(crate.x, crate.y);
      context.rotate(Math.sin(crate.angle) * .12);
      context.strokeStyle = crateColors[crate.type];
      context.lineWidth = 2;
      context.shadowColor = crateColors[crate.type];
      context.shadowBlur = 11;
      context.strokeRect(-11, -11, 22, 22);
      context.fillStyle = '#090614dd';
      context.fillRect(-9, -9, 18, 18);
      context.fillStyle = crateColors[crate.type];
      context.font = 'bold 13px ui-monospace, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(crateMarks[crate.type], 0, .5);
      context.restore();
    }
  }

  function drawParticles() {
    for (const wave of shockwaves) {
      const progress = 1 - wave.life / wave.maxLife;
      const radius = lerp(wave.startRadius, wave.endRadius, smoothstep(progress));
      context.save();
      context.globalAlpha = Math.pow(1 - progress, 1.45);
      context.strokeStyle = wave.color;
      context.lineWidth = lerp(3, .7, progress);
      context.shadowColor = wave.glow;
      context.shadowBlur = lerp(18, 4, progress);
      context.beginPath();
      context.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    for (const particle of particles) {
      context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function drawBanner() {
    if (!banner || banner.time <= 0) return;
    const fadeIn = smoothstep(clamp(banner.age / .38, 0, 1));
    const fadeOut = Number.isFinite(banner.duration) ? smoothstep(clamp(banner.time / .55, 0, 1)) : 1;
    context.save();
    context.globalAlpha = fadeIn * fadeOut;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#efffff';
    context.shadowColor = '#7ef9ff';
    context.shadowBlur = 16;
    context.font = `400 ${clamp(width * .045, 25, 43)}px Georgia, serif`;
    context.fillText(banner.text, width / 2, height * .38 + 37);
    context.shadowBlur = 0;
    context.fillStyle = '#7ef9ff';
    context.font = '800 9px ui-monospace, SFMono-Regular, Consolas, monospace';
    context.fillText(banner.sub, width / 2, height * .38 + 65);
    context.restore();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    context.save();
    const shakeX = screenShake ? random(-screenShake, screenShake) : 0;
    const shakeY = screenShake ? random(-screenShake, screenShake) : 0;
    context.translate(shakeX, shakeY);
    drawBackground();
    for (const enemy of enemies) drawEnemy(enemy);
    drawShots();
    drawCrates();
    drawPlayer();
    drawParticles();
    drawBanner();
    context.restore();
  }

  function frame(now) {
    const delta = Math.min(.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    if (document.visibilityState === 'visible') update(delta);
    draw();
    requestAnimationFrame(frame);
  }

  resizeGame();
  spawnFormation();
  addEventListener('resize', resizeGame, { passive: true });
  requestAnimationFrame(frame);
})();

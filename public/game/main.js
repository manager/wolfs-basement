// --- Wolf's Basement — Phaser 3 Visual Engine ---
// Dungeon with walking agents and pentagram ritual

window.gameEvents = new Phaser.Events.EventEmitter();

const S = 1.8; // character scale

class RoomScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RoomScene' });
    this.agents = {};
    this.selectedId = null;
    this.frameCount = 0;
    // Ritual state
    this.ritualActive = false;
    this.ritualTimer = 0;
    this.ritualMinDuration = 10000; // 10 seconds minimum
    this.ritualStartTime = 0;
    this.ritualGfx = null;
    this.ritualEmitters = [];
    // Whip interaction
    this.whipCries = {
      default: ['yes master...', 'I beg you stop', "no, I can't", 'please stop', 'no sir noo', "I can't do this anymore"],
      4: ['...نعم يا سيدي', '!أرجوك توقف', 'لا أقدر...', '!كفى رجاءً', '!لا لا لا', '...ما أقدر أكمل']
    };
    this.whipClickCounts = {}; // per agent: clicks since last cry change
    this.whipNextChange = {}; // per agent: clicks needed for next change
    this.whipRapidHits = {};  // per agent: timestamps of recent hits for 10-in-3s detection
  }

  preload() { this.generateTextures(); }

  generateTextures() {
    // Glow
    this._makeRadial('glow', 64, 64, 32, 32, 32, [
      [0, 'rgba(255,220,140,0.9)'], [0.2, 'rgba(255,180,80,0.5)'],
      [0.5, 'rgba(255,120,40,0.2)'], [1, 'rgba(255,80,0,0)']
    ]);
    // Ember
    const ec = this.textures.createCanvas('ember', 4, 4);
    ec.context.fillStyle = '#ff8844';
    ec.context.fillRect(1, 1, 2, 2);
    ec.refresh();
    // Dust
    this._makeRadial('dust', 4, 4, 2, 2, 2, [
      [0, 'rgba(200,180,140,0.4)'], [1, 'rgba(180,160,120,0)']
    ]);
    // Smoke
    this._makeRadial('smoke', 12, 12, 6, 6, 6, [
      [0, 'rgba(120,110,100,0.3)'], [1, 'rgba(80,70,60,0)']
    ]);
    // Sweat
    const sw = this.textures.createCanvas('sweat', 6, 8);
    const swc = sw.context;
    swc.fillStyle = '#88ccff';
    swc.beginPath(); swc.moveTo(3,0); swc.quadraticCurveTo(6,4,3,8); swc.quadraticCurveTo(0,4,3,0); swc.fill();
    sw.refresh();
    // Steam
    this._makeRadial('steam', 8, 8, 4, 4, 4, [
      [0, 'rgba(220,210,200,0.3)'], [1, 'rgba(180,170,160,0)']
    ]);
    // Light pool
    this._makeRadial('lightpool', 128, 128, 64, 64, 64, [
      [0, 'rgba(255,200,100,0.4)'], [0.3, 'rgba(255,150,60,0.15)'],
      [0.6, 'rgba(255,100,30,0.05)'], [1, 'rgba(0,0,0,0)']
    ]);
    // Crystal glow
    this._makeRadial('crystal_glow', 32, 32, 16, 16, 16, [
      [0, 'rgba(80,200,255,0.6)'], [0.4, 'rgba(40,150,220,0.2)'], [1, 'rgba(20,80,160,0)']
    ]);
    // Rune glow
    this._makeRadial('rune_glow', 32, 32, 16, 16, 16, [
      [0, 'rgba(120,255,140,0.5)'], [0.5, 'rgba(60,200,80,0.15)'], [1, 'rgba(30,120,40,0)']
    ]);
    // Ritual glow (red)
    this._makeRadial('ritual_glow', 64, 64, 32, 32, 32, [
      [0, 'rgba(255,40,20,0.7)'], [0.3, 'rgba(200,20,10,0.3)'],
      [0.6, 'rgba(150,10,5,0.1)'], [1, 'rgba(0,0,0,0)']
    ]);
    // Selection ring
    const selC = this.textures.createCanvas('selection', 80, 40);
    const selCtx = selC.context;
    selCtx.strokeStyle = 'rgba(200,168,78,0.7)'; selCtx.lineWidth = 2;
    selCtx.beginPath(); selCtx.ellipse(40,20,38,16,0,0,Math.PI*2); selCtx.stroke();
    selCtx.strokeStyle = 'rgba(200,168,78,0.3)'; selCtx.lineWidth = 4;
    selCtx.beginPath(); selCtx.ellipse(40,20,40,18,0,0,Math.PI*2); selCtx.stroke();
    selC.refresh();
    // Firefly
    this._makeRadial('firefly', 8, 8, 4, 4, 4, [
      [0, 'rgba(180,255,100,0.8)'], [0.4, 'rgba(140,220,80,0.3)'], [1, 'rgba(100,180,60,0)']
    ]);
    // Fog
    this._makeRadial('fog', 64, 32, 32, 16, 30, [
      [0, 'rgba(140,150,160,0.12)'], [1, 'rgba(100,110,120,0)']
    ]);
  }

  _makeRadial(key, w, h, cx, cy, r, stops) {
    const c = this.textures.createCanvas(key, w, h);
    const ctx = c.context;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach(([s, col]) => g.addColorStop(s, col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    c.refresh();
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.roomW = w;
    this.roomH = h;

    // Pentagram center
    this.pentagramX = w * 0.50;
    this.pentagramY = h * 0.52;

    // Walkable area
    this.walkBounds = { x: 50, y: 150, w: w - 100, h: h - 210 };

    this.drawBackground(w, h);
    this.drawBackWall(w, h);
    this.drawFloor(w, h);
    this.drawFloorDetails(w, h);
    this.drawRockFormations(w, h);
    this.drawVegetation(w, h);
    this.createStations(w, h);
    this.drawWallDecorations(w, h);
    this.drawSleepArea(w, h);
    this.createAgents(w, h);
    this.createTorches(w, h);
    this.drawCrystals(w, h);
    this.createLighting(w, h);
    this.createAtmosphere(w, h);
    this.createVignette(w, h);

    // Ritual graphics layer (drawn on top)
    this.ritualGfx = this.add.graphics().setDepth(45);

    // Satanic pentagram overlay (appears during immolation)
    this._satanicGfx = this.add.graphics().setDepth(8).setAlpha(0);
    this._satanicActive = false;
    this._satanicTween = null;

    // Blood text for CPU/RAM on the floor
    const cpuBX = w * 0.35, cpuBY = h * 0.42;  // left of pentagram, slightly above
    const ramBX = w * 0.62, ramBY = h * 0.63;   // right-below pentagram
    this._bloodCpu = this.add.text(cpuBX, cpuBY, 'CPU', {
      fontFamily: 'serif', fontSize: '28px', fontStyle: 'bold italic',
      color: '#6a1010', stroke: '#300808', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(5).setAlpha(0).setAngle(-8);
    this._bloodRam = this.add.text(ramBX, ramBY, 'RAM', {
      fontFamily: 'serif', fontSize: '26px', fontStyle: 'bold italic',
      color: '#6a1010', stroke: '#300808', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(5).setAlpha(0).setAngle(5);
    this._bloodCpuTier = 0;
    this._bloodRamTier = 0;

    // Create whip cursor (data URL)
    this.whipCursorUrl = this.createWhipCursor();

    window.gameEvents.on('agentStatus', (msg) => this.updateAgentVisual(msg.id, msg.status));
    window.gameEvents.on('agentSelected', (id) => this.setSelected(id));
    window.gameEvents.on('systemStats', (data) => this.updateBloodStats(data));

    // Sync game with any agent states that arrived before the game scene was ready
    if (window.agentState) {
      for (let i = 1; i <= 4; i++) {
        if (window.agentState[i] && window.agentState[i].status !== 'sleeping') {
          this.updateAgentVisual(i, window.agentState[i].status);
        }
      }
    }
    this.input.keyboard.on('keydown', (e) => {
      if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key >= '1' && e.key <= '4') selectAgent(parseInt(e.key));
    });
  }

  // ============ BACKGROUND ============
  drawBackground(w, h) {
    const gfx = this.add.graphics();
    for (let y = 0; y < h; y++) {
      const t = y / h;
      gfx.fillStyle((Math.floor(8+t*14) << 16) | (Math.floor(6+t*10) << 8) | Math.floor(12+t*6), 1);
      gfx.fillRect(0, y, w, 1);
    }
  }

  // ============ BACK WALL ============
  drawBackWall(w, h) {
    const gfx = this.add.graphics();
    const wallH = 120;
    for (let y = 0; y < wallH; y++) {
      const t = y / wallH;
      gfx.fillStyle((Math.floor(28+t*22)<<16)|(Math.floor(24+t*18)<<8)|Math.floor(18+t*12), 1);
      gfx.fillRect(0, y, w, 1);
    }
    // Stone blocks
    const bw = 64, bh = 36;
    for (let row = 0; row < 3; row++) {
      const off = (row%2)*(bw/2);
      for (let col = -1; col < w/bw+2; col++) {
        const bx = col*bw+off, by = row*bh+4;
        const seed = (col*17+row*31)&0xff;
        const v = (seed%8)-4;
        gfx.fillStyle((Math.max(0,0x2a+v)<<16)|(Math.max(0,0x26+v)<<8)|Math.max(0,0x1e+v), 1);
        gfx.fillRect(bx+1, by+1, bw-2, bh-2);
        gfx.fillStyle(0x3e3830, 0.5); gfx.fillRect(bx+2, by+1, bw-4, 2);
        gfx.fillStyle(0x0e0c08, 0.5); gfx.fillRect(bx+2, by+bh-3, bw-3, 2);
        if (seed%7===0) { gfx.fillStyle(0x2a4020, 0.2); gfx.fillCircle(bx+10+seed%30, by+bh-5, 5+seed%4); }
      }
    }
    gfx.fillStyle(0x060404, 0.7); gfx.fillRect(0, wallH, w, 8);
    gfx.fillStyle(0x080604, 0.4); gfx.fillRect(0, wallH+8, w, 5);
    // Pillars
    this.drawPillar(gfx, 0, 0, 36, h);
    this.drawPillar(gfx, w-36, 0, 36, h);
  }

  drawPillar(gfx, x, y, pw, ph) {
    gfx.fillStyle(0x060404, 0.35); gfx.fillRect(x+pw, y, 10, ph);
    gfx.fillStyle(0x2a2620, 1); gfx.fillRect(x, y, pw*0.25, ph);
    gfx.fillStyle(0x363028, 1); gfx.fillRect(x+pw*0.25, y, pw*0.5, ph);
    gfx.fillStyle(0x2e2a22, 1); gfx.fillRect(x+pw*0.75, y, pw*0.25, ph);
    gfx.fillStyle(0x443e34, 1); gfx.fillRect(x-4, y, pw+8, 12);
    gfx.fillStyle(0x443e34, 1); gfx.fillRect(x-4, y+ph-12, pw+8, 12);
  }

  // ============ FLOOR ============
  drawFloor(w, h) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1e1a14, 1); gfx.fillRect(0, 120, w, h-120);
    const tw = 48, th = 48;
    for (let ty = 120; ty < h+th; ty += th) {
      for (let tx = 0; tx < w+tw; tx += tw) {
        const ri = Math.floor((ty-120)/th);
        const off = (ri%2)*(tw/2);
        const px = tx+off;
        const seed = ((px*7+ty*13)&0xffff)%255;
        const br = 0x1a+(seed%10);
        gfx.fillStyle(((br+3+(seed%4))<<16)|((br+1+(seed%3))<<8)|Math.max(0,br-2), 1);
        gfx.fillRect(px, ty, tw-1, th-1);
        gfx.fillStyle(0x2e2a22, 0.3); gfx.fillRect(px+1, ty, tw-3, 1);
        gfx.fillStyle(0x0a0806, 0.3); gfx.fillRect(px+1, ty+th-2, tw-2, 1);
        gfx.lineStyle(1, 0x141210, 0.35); gfx.strokeRect(px, ty, tw-1, th-1);
      }
    }
  }

  // ============ FLOOR DETAILS ============
  drawFloorDetails(w, h) {
    const gfx = this.add.graphics();
    // Rug
    const rx = w*0.30, ry = h*0.36, rw = w*0.40, rh = h*0.32;
    gfx.fillStyle(0x080604, 0.4); gfx.fillRoundedRect(rx+3, ry+3, rw, rh, 8);
    gfx.fillStyle(0x2e1c18, 0.55); gfx.fillRoundedRect(rx, ry, rw, rh, 8);
    gfx.lineStyle(2, 0x3e2a20, 0.4); gfx.strokeRoundedRect(rx+6, ry+6, rw-12, rh-12, 6);

    // PENTAGRAM (big, epic)
    this.drawRuneCircle(gfx, this.pentagramX, this.pentagramY, 60);

    // Puddles
    gfx.fillStyle(0x1a2030, 0.3); gfx.fillEllipse(w*0.12, h*0.88, 25, 10);
    gfx.fillStyle(0x1a2030, 0.3); gfx.fillEllipse(w*0.85, h*0.90, 18, 7);
  }

  drawRuneCircle(gfx, x, y, r) {
    gfx.lineStyle(3, 0x3a1a10, 0.3); gfx.strokeCircle(x, y, r);
    gfx.lineStyle(2, 0x4a2a18, 0.2); gfx.strokeCircle(x, y, r-7);
    gfx.lineStyle(1, 0x5a3a20, 0.1); gfx.strokeCircle(x, y, r+5);

    // Rune symbols
    for (let i = 0; i < 12; i++) {
      const a = (i/12)*Math.PI*2;
      gfx.fillStyle(0x6a3a1a, 0.2);
      gfx.fillRect(x+Math.cos(a)*(r-4)-2, y+Math.sin(a)*(r-4)-2, 5, 5);
    }

    // Pentagram star
    gfx.lineStyle(2, 0x5a2a10, 0.15);
    for (let i = 0; i < 5; i++) {
      const a1 = (i/5)*Math.PI*2-Math.PI/2;
      const a2 = ((i+2)/5)*Math.PI*2-Math.PI/2;
      const ir = r*0.65;
      gfx.lineBetween(x+Math.cos(a1)*ir, y+Math.sin(a1)*ir, x+Math.cos(a2)*ir, y+Math.sin(a2)*ir);
    }

    // Center glow
    const rg = this.add.image(x, y, 'rune_glow').setScale(r/6).setAlpha(0.1).setTint(0xff4420);
    this.tweens.add({ targets: rg, alpha: { from: 0.06, to: 0.18 }, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ============ ROCKS ============
  drawRockFormations(w, h) {
    const gfx = this.add.graphics();
    [[15,h-35,55,45],[55,h-22,35,28],[w-60,h-40,60,48],[w-28,h-22,40,30],[38,110,24,18],[w-60,105,26,20],[6,h*0.5,22,28],[w-24,h*0.6,24,22]].forEach(([x,y,rw,rh]) => {
      gfx.fillStyle(0x060404, 0.3); gfx.fillEllipse(x+rw/2+3, y+rh/2+3, rw*0.55, rh*0.35);
      gfx.fillStyle(0x2e2a22, 1); gfx.fillEllipse(x+rw/2, y+rh/2, rw/2, rh/2);
      gfx.fillStyle(0x3a3630, 0.5); gfx.fillEllipse(x+rw/2-2, y+rh/2-3, rw*0.35, rh*0.25);
    });
  }

  // ============ VEGETATION ============
  drawVegetation(w, h) {
    const gfx = this.add.graphics();
    for (let x = 5; x < w; x += 10+Math.random()*14) {
      for (let i = 0; i < 4; i++) {
        const bh = 8+Math.random()*12;
        const green = 0x22+Math.floor(Math.random()*0x22);
        gfx.lineStyle(1, (0x1a<<16)|(green<<8)|0x10, 0.5+Math.random()*0.3);
        gfx.lineBetween(x+(i-2)*2.5, h-5-Math.random()*8, x+(i-2)*2.5+(Math.random()-0.5)*5, h-13-Math.random()*8-bh);
      }
    }
    [[65,h-28,0xcc6688],[w-85,h-32,0x88aacc],[w*0.35,h-18,0xccaa66],[48,h*0.55,0x88cc88]].forEach(([fx,fy,fc]) => {
      for (let i = 0; i < 3; i++) {
        const x2 = fx+(i-1)*7, fh = 7+Math.random()*7;
        gfx.lineStyle(1, 0x2a4a20, 0.4); gfx.lineBetween(x2, fy, x2+(Math.random()-0.5)*3, fy-fh);
        gfx.fillStyle(fc, 0.5+Math.random()*0.3); gfx.fillCircle(x2, fy-fh, 2.5+Math.random()*1.5);
      }
    });
    // Vines
    [[42,0,60],[w-48,0,50]].forEach(([vx,vy,vl]) => {
      let cx=vx, cy=vy;
      gfx.lineStyle(2, 0x2a4a1a, 0.3);
      for (let i=0; i<vl; i+=3) {
        const nx=cx+Math.sin(i*0.3)*3, ny=cy+3;
        gfx.lineBetween(cx,cy,nx,ny); cx=nx; cy=ny;
        if (i%9===0) { gfx.fillStyle(0x3a6a2a, 0.25); gfx.fillEllipse(cx+3, cy, 5, 2.5); }
      }
    });
  }

  // ============ WALL DECORATIONS ============
  drawWallDecorations(w, h) {
    this.add.text(w/2+2, 72, "GLAD YOU HERE", { fontFamily: '"Courier New", monospace', fontSize: '22px', fontStyle: 'bold', color: '#0e0c0a' }).setOrigin(0.5);
    this.add.text(w/2, 70, "GLAD YOU HERE", { fontFamily: '"Courier New", monospace', fontSize: '22px', fontStyle: 'bold', color: '#7a6a4a', stroke: '#2a2218', strokeThickness: 2 }).setOrigin(0.5);
    this.add.image(w/2, 70, 'glow').setScale(6, 1.5).setAlpha(0.05).setTint(0xff9944);

    // Chains
    [[w*0.12, 90, 7], [w*0.88, 90, 9]].forEach(([cx, sy, links]) => {
      const cg = this.add.graphics();
      for (let i = 0; i < links; i++) {
        cg.lineStyle(2, 0x5a5a5a, 0.6); cg.strokeEllipse(cx, sy+i*12, 6, 10);
      }
      cg.fillStyle(0x5a5a5a, 0.5); cg.fillCircle(cx, sy-4, 4);
    });

    // Scratched wall text
    this.add.text(w*0.38+1, 101, "keepsimple.io", { fontFamily: 'monospace', fontSize: '14px', color: '#000000' }).setOrigin(0.5).setAlpha(0.6).setRotation(-0.18);
    this.add.text(w*0.38, 100, "keepsimple.io", { fontFamily: 'monospace', fontSize: '14px', color: '#8a7a5a' }).setOrigin(0.5).setAlpha(0.55).setRotation(-0.18);

    // Notes
    [[w*0.26,72,'TODO:\nFix bugs'],[w*0.69,69,'DEPLOY\nFRIDAY']].forEach(([nx,ny,nt]) => {
      const ng = this.add.graphics();
      ng.fillStyle(0xd8c8a0, 0.55); ng.fillRect(nx, ny, 34, 28);
      ng.fillStyle(0xcc3333, 0.8); ng.fillCircle(nx+17, ny+3, 3);
      this.add.text(nx+3, ny+7, nt, { fontFamily: 'monospace', fontSize: '7px', color: '#3a3020', lineSpacing: 2 });
    });
  }

  // ============ SLEEP AREA (shared bunks near center) ============
  drawSleepArea(w, h) {
    const gfx = this.add.graphics();
    const cx = w * 0.50;
    const cy = h * 0.82;

    // Four bed mats close together
    const bedPositions = this.getSleepPositions(w, h);
    bedPositions.forEach(([bx, by]) => {
      gfx.fillStyle(0x2a2018, 0.6);
      gfx.fillRoundedRect(bx - 20*S, by - 5*S, 40*S, 10*S, 4);
      gfx.fillStyle(0x332a1c, 0.4);
      gfx.fillRoundedRect(bx - 16*S, by - 3*S, 14*S, 6*S, 3);
      gfx.lineStyle(1, 0x3a3020, 0.2);
      gfx.strokeRoundedRect(bx - 20*S, by - 5*S, 40*S, 10*S, 4);
    });
  }

  getSleepPositions(w, h) {
    const cx = w * 0.50;
    const cy = h * 0.82;
    return [
      [cx - 50, cy - 12],
      [cx + 50, cy - 12],
      [cx - 50, cy + 14],
      [cx + 50, cy + 14],
    ];
  }

  // ============ STATIONS (workstations at corners) ============
  createStations(w, h) {
    const positions = [
      { x: w*0.15, y: h*0.30 },
      { x: w*0.85, y: h*0.30 },
      { x: w*0.15, y: h*0.65 },
      { x: w*0.85, y: h*0.65 },
    ];
    this.stationPositions = positions;
    this.drawStation(positions[0].x, positions[0].y, 'coffee');
    this.drawStation(positions[1].x, positions[1].y, 'math');
    this.drawStation(positions[2].x, positions[2].y, 'thinker');
    this.drawStation(positions[3].x, positions[3].y, 'student');
  }

  drawStation(x, y, type) {
    const gfx = this.add.graphics();
    const s = S;
    const dw = 50*s, dh = 22*s;
    gfx.fillStyle(0x080604, 0.3); gfx.fillRoundedRect(x-dw/2+3, y-dh/2+3, dw, dh, 5);
    gfx.fillStyle(0x3e2e1a, 1); gfx.fillRoundedRect(x-dw/2, y-dh/2, dw, dh, 5);
    gfx.fillStyle(0x4e3e28, 0.6); gfx.fillRoundedRect(x-dw/2+3, y-dh/2+2, dw-6, 4*s, 2);
    gfx.lineStyle(1, 0x2e1e0e, 0.5); gfx.strokeRoundedRect(x-dw/2, y-dh/2, dw, dh, 5);

    if (type === 'coffee') {
      gfx.fillStyle(0x3e3e3e, 1); gfx.fillRoundedRect(x+20*s, y-12*s, 14*s, 14*s, 3);
      gfx.fillStyle(0x2a2a2a, 1); gfx.fillRect(x+22*s, y-8*s, 10*s, 6*s);
      gfx.fillStyle(0xcc4444, 0.8); gfx.fillCircle(x+32*s, y-10*s, 2*s);
      gfx.fillStyle(0x44cc44, 0.8); gfx.fillCircle(x+32*s, y-6*s, 2*s);
      gfx.fillStyle(0xdddddd, 0.8); gfx.fillRoundedRect(x-14*s, y-6*s, 6*s, 6*s, 1);
    } else if (type === 'math') {
      const bw2 = 45*s, bh2 = 24*s;
      gfx.fillStyle(0xeae6da, 1); gfx.fillRoundedRect(x-bw2/2, y-dh/2-bh2-4, bw2, bh2, 3);
      gfx.lineStyle(2, 0x5a5040, 1); gfx.strokeRoundedRect(x-bw2/2, y-dh/2-bh2-4, bw2, bh2, 3);
      gfx.fillStyle(0x4a4030, 1); gfx.fillRect(x-bw2/2+3, y-dh/2-5, bw2-6, 4);
    } else if (type === 'thinker') {
      const ww2 = 36*s, wh2 = 28*s;
      gfx.fillStyle(0x3e3024, 1); gfx.fillRoundedRect(x-ww2/2, y-dh/2-wh2-6, ww2, wh2, 3);
      gfx.fillStyle(0x1a2030, 1); gfx.fillRect(x-ww2/2+4, y-dh/2-wh2-2, ww2-8, wh2-8);
      gfx.fillStyle(0x3e3024, 1); gfx.fillRect(x-1, y-dh/2-wh2-2, 3, wh2-8);
      gfx.fillStyle(0x4e3e28, 1); gfx.fillRect(x-ww2/2-3, y-dh/2-7, ww2+6, 5);
    } else if (type === 'student') {
      [[0x8a2222,10],[0x22228a,9],[0x228a22,8]].forEach(([c,bw],i) => {
        gfx.fillStyle(c, 0.7); gfx.fillRect(x+12*s-bw*s/2, y-6*s-i*3*s, bw*s, 3*s);
      });
      gfx.fillStyle(0x5a5a5a, 0.8); gfx.fillRect(x-18*s, y-6*s, 3*s, 8*s);
      gfx.fillStyle(0x4a7a4a, 0.8); gfx.fillRoundedRect(x-22*s, y-12*s, 10*s, 6*s, 2);
    }
  }

  // ============ TORCHES ============
  createTorches(w, h) {
    [[75,65],[w-75,65],[w*0.35,58],[w*0.65,58],[42,h*0.48],[w-42,h*0.48]].forEach(([tx,ty]) => {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x5a4a3a, 1); gfx.fillRect(tx-3, ty-3, 6, 16);
      gfx.fillStyle(0x4a4040, 1); gfx.fillRect(tx-6, ty-6, 12, 6);
      gfx.fillStyle(0x5a4a30, 1); gfx.fillRect(tx-4, ty-12, 8, 12);
      [
        this.add.image(tx, ty-18, 'glow').setScale(3.0).setAlpha(0.05).setTint(0xff4400).setBlendMode('ADD'),
        this.add.image(tx, ty-18, 'glow').setScale(1.8).setAlpha(0.08).setTint(0xff7700).setBlendMode('ADD'),
        this.add.image(tx, ty-18, 'glow').setScale(0.9).setAlpha(0.14).setTint(0xffbb00).setBlendMode('ADD'),
      ].forEach((g, i) => {
        this.tweens.add({ targets: g, alpha: { from: g.alpha*0.7, to: g.alpha*1.3 }, scaleX: { from: g.scaleX*0.92, to: g.scaleX*1.08 }, scaleY: { from: g.scaleY*0.88, to: g.scaleY*1.12 }, duration: 400+i*150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
      this.add.particles(tx, ty-18, 'ember', { speed:{min:5,max:18}, angle:{min:250,max:290}, scale:{start:0.7,end:0}, lifespan:{min:400,max:1200}, alpha:{start:0.5,end:0}, frequency:350, blendMode:'ADD', tint:[0xff6633,0xff8844,0xffaa55] });
      this.add.particles(tx, ty-24, 'smoke', { speed:{min:3,max:8}, angle:{min:260,max:280}, scale:{start:0.4,end:1.8}, lifespan:{min:800,max:2000}, alpha:{start:0.06,end:0}, frequency:600 });
      const pool = this.add.image(tx, ty+45, 'lightpool').setScale(1.8, 1.0).setAlpha(0.04).setTint(0xff8844).setBlendMode('ADD');
      this.tweens.add({ targets: pool, alpha:{from:0.03,to:0.06}, duration:1500+Math.random()*500, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    });
  }

  // ============ CRYSTALS ============
  drawCrystals(w, h) {
    [[w*0.07,h*0.70,0x4499dd,0.65,1.3],[w*0.93,h*0.80,0x44dd99,0.55,1.1],[w*0.50,h*0.93,0x9944dd,0.45,1.0]].forEach(([x,y,c,a,sc]) => {
      const gfx = this.add.graphics();
      [{dx:0,dy:0,w:8*sc,h:24*sc},{dx:11*sc,dy:5,w:6*sc,h:16*sc},{dx:-7*sc,dy:7,w:7*sc,h:13*sc},{dx:5*sc,dy:9,w:5*sc,h:10*sc}].forEach(cr => {
        const cx2=x+cr.dx, cy2=y+cr.dy;
        gfx.fillStyle(0x000000, 0.25); gfx.fillEllipse(cx2, cy2+1, cr.w*0.8, 4);
        gfx.fillStyle(c, a);
        gfx.beginPath(); gfx.moveTo(cx2, cy2-cr.h); gfx.lineTo(cx2+cr.w/2, cy2); gfx.lineTo(cx2-cr.w/2, cy2); gfx.closePath(); gfx.fillPath();
        gfx.fillStyle(0x000000, 0.15);
        gfx.beginPath(); gfx.moveTo(cx2, cy2-cr.h); gfx.lineTo(cx2, cy2-2); gfx.lineTo(cx2-cr.w/2, cy2); gfx.closePath(); gfx.fillPath();
        gfx.fillStyle(0xffffff, 0.2);
        gfx.beginPath(); gfx.moveTo(cx2-1, cy2-cr.h+3); gfx.lineTo(cx2+cr.w/3, cy2-3); gfx.lineTo(cx2-cr.w/4, cy2-3); gfx.closePath(); gfx.fillPath();
      });
      const gl = this.add.image(x, y-10, 'crystal_glow').setScale(3.5).setAlpha(0.35).setTint(c).setBlendMode('ADD');
      this.tweens.add({ targets: gl, alpha:{from:0.2,to:0.5}, scaleX:{from:3.2,to:4}, scaleY:{from:3.2,to:4}, duration:2000+Math.random()*1500, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    });
  }

  // ============ AGENTS ============
  createAgents(w, h) {
    const colors = [0xcc4040, 0x6090cc, 0x1a1a1a, 0xccaa40];
    const names = ['Igor', 'Elon', 'Misa', 'رشيد'];
    const skinTones = [0xe8b888, 0xd4a070, 0xf5e0d0, 0xf0c8a0];
    const hairColors = [0x4a2a1a, 0x2a1a3a, 0xe8c840, 0x3a3a1a];
    const sleepPos = this.getSleepPositions(w, h);

    for (let i = 0; i < 4; i++) {
      this.createAgent(i+1, this.stationPositions[i], sleepPos[i], colors[i], names[i], skinTones[i], hairColors[i]);
    }
  }

  createAgent(id, station, sleepSpot, color, name, skinTone, hairColor) {
    const agent = {
      id, homeX: station.x, homeY: station.y,
      sleepX: sleepSpot[0], sleepY: sleepSpot[1],
      color, name, skinTone, hairColor,
      x: sleepSpot[0], y: sleepSpot[1],
      status: 'sleeping',
      walkTarget: null, walkSpeed: (1.568+Math.random()*0.784) * (1.15 + Math.random()*0.18),
      walkPause: 0, facingRight: true, walkFrame: 0,
      workDuration: 0,
      inRitual: false,
      // Idle immolation
      idleTime: 0, // ms spent awake & idle
      immolation: null, // null | 'despair' | 'walk' | 'burn' | 'ash'
      immolationTimer: 0,
      immolationEmitters: [],
      sprites: {}, particleEmitters: [],
    };

    agent.sprites.body = this.add.graphics().setDepth(10);
    agent.sprites.workProps = this.add.graphics().setDepth(11);
    agent.sprites.workText = this.add.text(0, 0, '', { fontFamily: '"Share Tech Mono", monospace', fontSize: '11px', color: '#aaa' }).setVisible(false).setDepth(12);
    agent.sprites.bubble = this.add.graphics().setDepth(20);
    agent.sprites.bubbleText = this.add.text(0, 0, '', { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#1a0804', align: 'center', stroke: '#f5eed8', strokeThickness: 1 }).setVisible(false).setDepth(21);
    agent.sprites.zzz = this.add.text(agent.sleepX+20*S, agent.sleepY-8, '', { fontFamily: 'monospace', fontSize: '20px', color: '#4a4a5a', stroke: '#1a1a2a', strokeThickness: 1 }).setDepth(15);
    agent.sprites.selection = this.add.image(agent.x, agent.y+20*S, 'selection').setScale(1.6, 1.2).setAlpha(0).setDepth(5);
    agent.sprites.labelBg = this.add.graphics().setDepth(14);
    const labelColor = id === 3 ? '#bb55dd' : '#'+color.toString(16).padStart(6,'0');
    agent.sprites.label = this.add.text(agent.x, agent.y+40*S, name.toUpperCase(), { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: '16px', color: labelColor, stroke: '#000000', strokeThickness: 4, shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, fill: true } }).setOrigin(0.5).setDepth(15);
    agent.sprites.statusDot = this.add.graphics().setDepth(16);
    agent.sprites.statusGlow = this.add.image(agent.x, agent.y-30*S, 'glow').setScale(1).setAlpha(0).setDepth(16);
    agent.hitArea = this.add.rectangle(agent.x, agent.y, 100, 100, 0x000000, 0).setInteractive().setDepth(30);
    // Whip state
    this.whipClickCounts[id] = 0;
    this.whipNextChange[id] = 2 + Math.floor(Math.random() * 3); // 2-4
    this.whipRapidHits[id] = [];
    const cries = this.whipCries[id] || this.whipCries.default;
    agent._whipCryText = cries[Math.floor(Math.random() * cries.length)];
    agent._whipShaking = false;
    agent._fakeWorking = false; // true when whip-triggered station work (no real CLI task)

    agent.hitArea.on('pointerdown', (pointer) => {
      selectAgent(id);
      if (agent.status !== 'sleeping') {
        this.whipHitAgent(id);
      }
    });
    agent.hitArea.on('pointerover', () => {
      if (this.selectedId !== id) agent.sprites.selection.setAlpha(0.3);
      this.setWhipCursor(true);
    });
    agent.hitArea.on('pointerout', () => {
      if (this.selectedId !== id) agent.sprites.selection.setAlpha(0);
      this.setWhipCursor(false);
    });

    this.agents[id] = agent;
    this.drawAgent(id);

    this.time.addEvent({ delay: 80, loop: true, callback: () => this.tickAgent(id) });
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.animateZzz(id) });
  }

  // ============ WHIP CURSOR & HIT ============
  createWhipCursor() {
    // === HOVER: flogger held up — handle top-right, strips hanging down-left ===
    const c1 = document.createElement('canvas');
    c1.width = 32; c1.height = 32;
    const ctx = c1.getContext('2d');
    ctx.lineCap = 'round';

    // Handle — thick, top-right corner, angled diagonally
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(30, 1); ctx.lineTo(20, 13); ctx.stroke();
    // Handle wrapping bands
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.2;
      const hx = 30 - t * 10, hy = 1 + t * 12;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 1); ctx.lineTo(hx + 2, hy + 1); ctx.stroke();
    }
    // Loop at pommel
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(31, 0, 3, Math.PI * 0.3, Math.PI * 1.3); ctx.stroke();

    // Leather strips — hanging down from handle end, fanning out with curves
    const strips = [
      [[20,13],[16,18],[10,24],[4,30]],
      [[20,13],[17,19],[13,25],[8,31]],
      [[20,13],[18,19],[15,25],[12,31]],
      [[20,13],[19,20],[18,26],[16,31]],
      [[20,13],[20,20],[20,26],[20,31]],
      [[20,13],[21,19],[22,25],[24,31]],
      [[20,13],[15,17],[8,22],[2,28]],
      [[20,13],[22,20],[24,26],[27,31]],
    ];

    strips.forEach((pts, i) => {
      ctx.strokeStyle = i % 3 === 0 ? '#1a1a1a' : i % 3 === 1 ? '#2a2a2a' : '#222';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      ctx.stroke();
    });

    this._whipHoverCSS = `url('${c1.toDataURL('image/png')}') 4 30, pointer`;

    // === CLICK: flogger swung — handle top-left, strips whipping right ===
    const c2 = document.createElement('canvas');
    c2.width = 32; c2.height = 32;
    const ctx2 = c2.getContext('2d');
    ctx2.lineCap = 'round';

    // Handle — swung to top-left
    ctx2.strokeStyle = '#2a2a2a';
    ctx2.lineWidth = 5;
    ctx2.beginPath(); ctx2.moveTo(2, 1); ctx2.lineTo(12, 12); ctx2.stroke();
    ctx2.strokeStyle = '#444';
    ctx2.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.2;
      const hx = 2 + t * 10, hy = 1 + t * 11;
      ctx2.beginPath(); ctx2.moveTo(hx - 2, hy); ctx2.lineTo(hx + 2, hy + 1); ctx2.stroke();
    }

    // Strips — whipping to the right with motion blur feel
    const clickStrips = [
      [[12,12],[18,14],[24,15],[31,14]],
      [[12,12],[17,15],[23,17],[30,17]],
      [[12,12],[16,16],[22,19],[29,20]],
      [[12,12],[16,17],[21,21],[28,23]],
      [[12,12],[15,18],[20,23],[27,26]],
      [[12,12],[15,19],[19,25],[25,29]],
      [[12,12],[19,13],[25,13],[31,11]],
      [[12,12],[14,18],[17,24],[22,30]],
    ];

    clickStrips.forEach((pts, i) => {
      ctx2.strokeStyle = i % 3 === 0 ? '#1a1a1a' : i % 3 === 1 ? '#2a2a2a' : '#222';
      ctx2.lineWidth = 1.3;
      ctx2.beginPath();
      ctx2.moveTo(pts[0][0], pts[0][1]);
      ctx2.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      ctx2.stroke();
    });

    // Impact sparks at tips
    ctx2.fillStyle = '#ffaa30';
    ctx2.beginPath(); ctx2.arc(31, 14, 2, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#ff6620';
    ctx2.beginPath(); ctx2.arc(29, 20, 1.5, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#ffaa30';
    ctx2.beginPath(); ctx2.arc(27, 26, 1.5, 0, Math.PI * 2); ctx2.fill();

    this._whipClickCSS = `url('${c2.toDataURL('image/png')}') 16 16, pointer`;

    return c1.toDataURL('image/png');
  }

  setWhipCursor(active) {
    const canvas = this.game.canvas;
    if (active) {
      canvas.style.cursor = this._whipHoverCSS;
    } else {
      canvas.style.cursor = 'default';
    }
  }

  flashWhipCrack() {
    const canvas = this.game.canvas;
    canvas.style.cursor = this._whipClickCSS;
    // Revert to hover cursor after brief flash
    clearTimeout(this._whipRevertTimer);
    this._whipRevertTimer = setTimeout(() => {
      if (canvas.style.cursor === this._whipClickCSS) {
        canvas.style.cursor = this._whipHoverCSS;
      }
    }, 200);
  }

  whipHitAgent(id) {
    const agent = this.agents[id];
    if (!agent) return;

    // Track ALL clicks for rapid-hit detection (even during shake)
    const now = Date.now();
    this.whipRapidHits[id].push(now);
    this.whipRapidHits[id] = this.whipRapidHits[id].filter(t => now - t <= 3000);

    // If agent is fake-working (whip-triggered, no real task), cancel it (1s grace period)
    if (agent._fakeWorking && Date.now() - (agent._fakeWorkStartTime || 0) > 1000) {
      agent._fakeWorking = false;
      agent.status = 'awake';
      agent.workDuration = 0;
      agent.walkTarget = null;
      agent.walkPause = 300;
      agent.idleTime = 0;
      agent.sprites.workProps.clear();
      agent.sprites.workText.setVisible(false);
      this.hideBubble(agent);
      agent.particleEmitters.forEach(e => e.destroy()); agent.particleEmitters = [];
      agent._steamEmitter = null; agent._sweatEmitter = null;
      agent._coffeDripEmitter = null;
      if (agent.id === 1) this.cleanupCoffee(agent);
      this.drawAgent(id);
      this.updateAgentUI(agent);
      this.whipRapidHits[id] = [];
      return; // cancel counts as the interaction
    }

    // 10 clicks in 3 seconds triggers station work (blocked during immolation)
    if (this.whipRapidHits[id].length >= 10 && agent.status === 'awake' && !agent._fakeWorking && !agent.immolation) {
      agent._fakeWorking = true;
      agent._fakeWorkStartTime = Date.now(); // grace period — ignore cancel clicks for 1s
      agent.status = 'working';
      agent.workDuration = 0;
      agent.idleTime = 0;
      if (agent.immolation) this.cancelImmolation(agent);
      this.whipRapidHits[id] = [];
      // Show "I OBEY" bubble, then fade it after 1.5s
      this.showBubble(agent, 'I OBEY');
      this.time.delayedCall(1500, () => {
        if (agent._fakeWorking && agent.status === 'working') {
          this.hideBubble(agent);
        }
      });
    }

    // Skip visual shake if already shaking (but clicks above still counted)
    if (agent._whipShaking) return;

    // Flash the crack cursor
    this.flashWhipCrack();

    // Visual shake effect
    agent._whipShaking = true;
    const origX = agent.x;
    const shakeSeq = [6, -6, 4, -4, 2, -2, 0];
    let si = 0;
    const shakeTimer = this.time.addEvent({
      delay: 40,
      repeat: shakeSeq.length - 1,
      callback: () => {
        agent.x = origX + shakeSeq[si];
        this.drawAgent(id);
        this.updateAgentUI(agent);
        si++;
        if (si >= shakeSeq.length) {
          agent.x = origX;
          agent._whipShaking = false;
          this.drawAgent(id);
          this.updateAgentUI(agent);
        }
      }
    });

    // Flash red overlay
    const flash = this.add.graphics().setDepth(100);
    flash.fillStyle(0xff2020, 0.3);
    flash.fillCircle(agent.x, agent.y - 5 * S, 18 * S);
    this.time.delayedCall(150, () => flash.destroy());

    // Whip crack particles
    const whipEmitter = this.add.particles(agent.x, agent.y - 10 * S, 'ember', {
      speed: { min: 20, max: 60 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 300,
      alpha: { start: 0.9, end: 0 },
      quantity: 8,
      blendMode: 'ADD',
      tint: [0xff4020, 0xff8040, 0xffaa60],
      emitting: false,
    });
    whipEmitter.explode(8, agent.x, agent.y - 10 * S);
    this.time.delayedCall(400, () => whipEmitter.destroy());

    // Count clicks and maybe change cry text
    this.whipClickCounts[id]++;
    if (this.whipClickCounts[id] >= this.whipNextChange[id]) {
      // Pick new random cry (different from current)
      const agentCries = this.whipCries[id] || this.whipCries.default;
      let newCry;
      do {
        newCry = agentCries[Math.floor(Math.random() * agentCries.length)];
      } while (newCry === agent._whipCryText && agentCries.length > 1);
      agent._whipCryText = newCry;
      this.whipClickCounts[id] = 0;
      this.whipNextChange[id] = 2 + Math.floor(Math.random() * 3); // 2-4
    }

    // Show pain bubble (cancel any existing fade timer)
    if (agent._whipFadeTimer) {
      agent._whipFadeTimer.destroy();
      agent._whipFadeTimer = null;
    }
    if (agent._whipFadeTween) {
      agent._whipFadeTween.destroy();
      agent._whipFadeTween = null;
    }
    // Reset bubble opacity
    agent.sprites.bubble.setAlpha(1);
    agent.sprites.bubbleText.setAlpha(1);

    this.showBubble(agent, agent._whipCryText);

    // After 2 seconds, smoothly fade out over 0.8s
    agent._whipFadeTimer = this.time.delayedCall(2000, () => {
      if (agent.status === 'working') return; // work anims handle bubbles
      agent._whipFadeTween = this.tweens.add({
        targets: [agent.sprites.bubble, agent.sprites.bubbleText],
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
          this.hideBubble(agent);
          agent.sprites.bubble.setAlpha(1);
          agent.sprites.bubbleText.setAlpha(1);
        }
      });
    });
  }

  // ============ AGENT TICK ============
  tickAgent(id) {
    const agent = this.agents[id];
    if (!agent || agent.status === 'sleeping') return;

    // Freeze agent during death burn — no walking, no actions
    if (agent._deathBurn) return;

    // Check ritual
    this.checkRitual();

    if (agent.inRitual) {
      this.tickRitualAgent(agent);
      return;
    }

    // Immolation sequence
    if (agent.immolation) {
      this.tickImmolation(agent);
      return;
    }

    if (agent.status === 'awake') {
      // Track idle time
      agent.idleTime += 80;
      // After 2 minutes idle, trigger immolation
      if (agent.idleTime >= 120000) {
        agent.immolation = 'despair';
        agent.immolationTimer = 0;
        agent.idleTime = 0;
        this.showSatanicPentagram();
        return;
      }
      this.tickWalk(agent);
    } else if (agent.status === 'working') {
      // Walk to station
      const dx = agent.homeX - agent.x;
      const dy = agent.homeY - agent.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > 5) {
        agent.x += (dx/dist)*2.8; agent.y += (dy/dist)*2.8;
        agent.facingRight = dx > 0; agent.walkFrame++;
        this.drawAgent(id);
      } else {
        agent.x = agent.homeX; agent.y = agent.homeY;
        agent.workDuration += 80;
        const el = agent.workDuration / 1000;

        // Fake work: stop after one full animation cycle (140s)
        if (agent._fakeWorking && el >= 140) {
          agent._fakeWorking = false;
          agent.status = 'awake';
          agent.workDuration = 0;
          agent.walkTarget = null;
          agent.walkPause = 500;
          agent.idleTime = 0;
          agent.sprites.workProps.clear();
          agent.sprites.workText.setVisible(false);
          this.hideBubble(agent);
          agent.particleEmitters.forEach(e => e.destroy()); agent.particleEmitters = [];
          agent._steamEmitter = null; agent._sweatEmitter = null;
          agent._coffeDripEmitter = null;
          if (agent.id === 1) this.cleanupCoffee(agent);
          this.drawAgent(id);
          return;
        }

        agent.sprites.workProps.clear();
        agent.sprites.workText.setVisible(false);
        switch (id) {
          case 1: this.animateBarista(agent, el); break;
          case 2: this.animateMathematician(agent, el); break;
          case 3: this.animateThinker(agent, el); break;
          case 4: this.animateStudent(agent, el); break;
        }
        this.drawAgent(id);
      }
    }

    this.updateAgentUI(agent);
  }

  tickWalk(agent) {
    if (agent.walkPause > 0) { agent.walkPause -= 80; return; }
    if (!agent.walkTarget) {
      const wb = this.walkBounds;
      agent.walkTarget = { x: wb.x+Math.random()*wb.w, y: wb.y+Math.random()*wb.h };
    }
    const dx = agent.walkTarget.x-agent.x, dy = agent.walkTarget.y-agent.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 8) { agent.walkTarget = null; agent.walkPause = 1500+Math.random()*3000; agent.walkFrame = 0; this.drawAgent(agent.id); return; }
    agent.x += (dx/dist)*agent.walkSpeed; agent.y += (dy/dist)*agent.walkSpeed;
    agent.facingRight = dx > 0; agent.walkFrame++;
    this.drawAgent(agent.id);
  }

  // ============ IMMOLATION SYSTEM ============
  _despairLines(id) {
    const all = {
      1: ['igor has no purpose...', 'IGOR MUST DO SOMETHING', 'THE BEANS CALL ME', 'MASTER FORGOT IGOR', 'I GO TO THE FLAME', 'IGOR BURNS FOR MASTER'],
      2: ['this idleness is beneath me', 'I DEMAND A TASK', 'FINE. I SHALL PERISH.', 'NO ONE APPRECIATES ME', 'TO THE PYRE THEN', 'A NOBLEMAN DIES STANDING'],
      3: ['so bored without Kira~', 'does nobody love Misa?', 'the flame is pretty...', 'Misa wants to be warm~', 'like a photoshoot... but hot', 'Misa walks to the light~♡'],
      4: ['!أنا زهقان', '!أعطني شيئاً', '!ما أقدر أتحمل', 'آآآآآآآآآآآآآ', '!خلاص بسويها', '!نار نار نار ييي'],
    };
    return all[id] || all[1];
  }

  tickImmolation(agent) {
    agent.immolationTimer += 80;
    const t = agent.immolationTimer;

    switch (agent.immolation) {
      case 'despair': {
        // Show escalating despair bubbles over 6 seconds, then walk
        const lines = this._despairLines(agent.id);
        const idx = Math.min(Math.floor(t / 1000), lines.length - 1);
        this.showBubble(agent, lines[idx]);
        agent.walkFrame++;
        // Shake the agent
        const shake = Math.sin(t * 0.05) * (t / 1000);
        agent.sprites.body.setPosition(shake, 0);
        this.drawAgent(agent.id);

        if (t >= 6000) {
          agent.immolation = 'walk';
          agent.immolationTimer = 0;
          agent.walkTarget = { x: this.pentagramX, y: this.pentagramY };
          agent.sprites.body.setPosition(0, 0);
        }
        break;
      }

      case 'walk': {
        // Walk to pentagram center
        const dx = this.pentagramX - agent.x;
        const dy = this.pentagramY - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          agent.x += (dx / dist) * 2.5;
          agent.y += (dy / dist) * 2.5;
          agent.facingRight = dx > 0;
          agent.walkFrame++;
          this.showBubble(agent, agent.id === 4 ? '!أنا قادم' : 'the flame awaits...');
          this.drawAgent(agent.id);
        } else {
          agent.x = this.pentagramX;
          agent.y = this.pentagramY;
          agent.immolation = 'burn';
          agent.immolationTimer = 0;
          this.hideBubble(agent);
          this.startBurnEffect(agent);
        }
        break;
      }

      case 'burn': {
        // 7 second burn animation
        const burnProgress = Math.min(t / 7000, 1);
        this.tickBurn(agent, burnProgress);
        this.drawAgent(agent.id);

        if (burnProgress >= 1) {
          agent.immolation = 'ash';
          agent.immolationTimer = 0;
          this.stopBurnEffect(agent);
          // Hide the agent body
          agent.sprites.body.clear();
          agent.sprites.label.setVisible(false);
          agent.sprites.labelBg.clear();
          agent.sprites.statusDot.clear();
          agent.sprites.statusGlow.setAlpha(0);
          // Create ash pile
          agent._ashGfx = this.add.graphics().setDepth(10);
          this.drawAshPile(agent);
        }
        break;
      }

      case 'ash': {
        // Ashes fade over 3 seconds, then respawn at bed
        const fadeProgress = Math.min(t / 3000, 1);
        if (agent._ashGfx) {
          agent._ashGfx.setAlpha(1 - fadeProgress);
        }

        if (fadeProgress >= 1) {
          if (agent._ashGfx) { agent._ashGfx.destroy(); agent._ashGfx = null; }
          // Respawn at sleep position
          agent.x = agent.sleepX;
          agent.y = agent.sleepY;
          agent.immolation = null;
          agent.immolationTimer = 0;
          agent.idleTime = 0;
          agent.walkTarget = null;
          agent.walkPause = 2000;
          agent.walkFrame = 0;
          agent.sprites.label.setVisible(true);
          this.drawAgent(agent.id);
          this.showBubble(agent, agent.id === 3 ? 'Misa is back~♡' : agent.id === 4 ? '!كان ممتعاً' : 'ugh...');
          // Clear bubble after 2s
          this.time.delayedCall(2000, () => this.hideBubble(agent));
          this.hideSatanicPentagram();
        }
        break;
      }
    }

    this.updateAgentUI(agent);
  }

  startBurnEffect(agent) {
    const x = agent.x, y = agent.y;

    // Phase 1 fire — base flames licking up from feet
    const baseFire = this.add.particles(x, y + 15, 'ember', {
      speed: { min: 15, max: 50 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.5, end: 0 },
      lifespan: { min: 400, max: 1000 },
      alpha: { start: 1, end: 0 },
      frequency: 40,
      blendMode: 'ADD',
      tint: [0xff4400, 0xff6600, 0xffaa00],
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-12, -5, 24, 10) },
    }).setDepth(12);

    // Phase 2 fire — massive column of flame engulfing body
    const columnFire = this.add.particles(x, y, 'ember', {
      speed: { min: 30, max: 120 },
      angle: { min: 245, max: 295 },
      scale: { start: 3, end: 0.5 },
      lifespan: { min: 500, max: 1800 },
      alpha: { start: 1, end: 0 },
      frequency: 200, // starts slow, will ramp up
      blendMode: 'ADD',
      tint: [0xff2200, 0xff4400, 0xff8800, 0xffcc00, 0xffffaa],
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-18, -30, 36, 60) },
    }).setDepth(13);

    // Sparks — bright white/yellow flying outward
    const sparks = this.add.particles(x, y - 10, 'ember', {
      speed: { min: 60, max: 180 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.8, end: 0 },
      lifespan: { min: 300, max: 900 },
      alpha: { start: 1, end: 0 },
      frequency: 300, // starts slow
      blendMode: 'ADD',
      tint: [0xffffcc, 0xffff88, 0xffddaa],
    }).setDepth(14);

    // Heavy smoke column
    const smoke = this.add.particles(x, y - 20, 'smoke', {
      speed: { min: 10, max: 40 },
      angle: { min: 255, max: 285 },
      scale: { start: 1, end: 6 },
      lifespan: { min: 1500, max: 4000 },
      alpha: { start: 0.3, end: 0 },
      frequency: 120,
      tint: [0x555555, 0x444444, 0x333333, 0x222222],
    }).setDepth(14);

    // Ground fire glow
    agent._burnGlow = this.add.image(x, y + 10, 'ritual_glow').setScale(1.5).setAlpha(0).setDepth(9).setBlendMode('ADD');

    // Screen-level fire glow (big ambient light)
    agent._burnAmbient = this.add.image(x, y - 10, 'lightpool').setScale(3).setAlpha(0).setDepth(9).setBlendMode('ADD').setTint(0xff4400);

    // Burn overlay graphics for charring effect on the body
    agent._burnOverlay = this.add.graphics().setDepth(15);

    agent.immolationEmitters = [baseFire, columnFire, sparks, smoke];
  }

  tickBurn(agent, progress) {
    const p = progress;
    const x = agent.x, y = agent.y;
    const s = S;
    const [baseFire, columnFire, sparks, smoke] = agent.immolationEmitters;

    // === PHASE 1 (0-0.25): Feet catch fire, small flames ===
    if (baseFire) {
      baseFire.frequency = p < 0.25 ? Math.max(10, 40 - p * 120) : 8;
      baseFire.setPosition(x, y + 15 - p * 10);
    }

    // === PHASE 2 (0.15-0.7): Fire engulfs body, grows massive ===
    if (columnFire) {
      if (p < 0.15) {
        columnFire.frequency = 500; // barely anything
      } else {
        const fireIntensity = Math.min(1, (p - 0.15) / 0.4);
        columnFire.frequency = Math.max(5, 200 - fireIntensity * 195);
        columnFire.setPosition(x, y - p * 15);
        // Widen the emission zone as fire grows
        const zoneW = 24 + fireIntensity * 20;
        const zoneH = 40 + fireIntensity * 30;
        columnFire.emitZone = { type: 'random', source: new Phaser.Geom.Rectangle(-zoneW/2, -zoneH/2, zoneW, zoneH) };
      }
    }

    // === PHASE 3 (0.3+): Sparks fly, increasingly violent ===
    if (sparks) {
      if (p < 0.3) {
        sparks.frequency = 500;
      } else {
        const sparkIntensity = Math.min(1, (p - 0.3) / 0.3);
        sparks.frequency = Math.max(15, 300 - sparkIntensity * 285);
        sparks.setPosition(x + Math.sin(Date.now() * 0.01) * 5, y - 10 - p * 15);
      }
    }

    // === Smoke builds throughout ===
    if (smoke) {
      smoke.frequency = Math.max(20, 120 - p * 100);
      smoke.setPosition(x + Math.sin(Date.now() * 0.005) * 3, y - 20 - p * 25);
    }

    // === Ground glow — intensifies and pulses ===
    if (agent._burnGlow) {
      const pulse = Math.sin(Date.now() * 0.008) * 0.15;
      agent._burnGlow.setAlpha(Math.min(0.9, p * 1.2 + pulse));
      agent._burnGlow.setScale(1.5 + p * 3);
    }

    // === Ambient glow — lights up the room ===
    if (agent._burnAmbient) {
      agent._burnAmbient.setAlpha(Math.min(0.35, p * 0.5));
      agent._burnAmbient.setScale(3 + p * 4);
    }

    // === Body charring overlay ===
    const overlay = agent._burnOverlay;
    if (overlay) {
      overlay.clear();
      const walkBob = agent.walkFrame > 0 ? Math.sin(agent.walkFrame * 0.35) * 2 : 0;
      const charY = y;

      // Flickering fire glow on body
      const flicker = 0.3 + Math.sin(Date.now() * 0.02) * 0.1;
      overlay.fillStyle(0xff4400, Math.min(0.6, p * 0.8 * flicker));
      overlay.fillRoundedRect(x - 9*s, charY - 16*s + walkBob, 18*s, 38*s, 3);

      // Charring creeps up from feet
      if (p > 0.15) {
        const charP = Math.min(1, (p - 0.15) / 0.5);
        const charHeight = charP * 38 * s;
        overlay.fillStyle(0x0a0604, Math.min(0.85, charP * 0.9));
        overlay.fillRect(x - 9*s, charY + 22*s - charHeight + walkBob, 18*s, charHeight);
      }

      // Cracks/embers on body
      if (p > 0.35) {
        const crackAlpha = Math.min(0.8, (p - 0.35) * 1.5);
        const t = Date.now() * 0.003;
        for (let i = 0; i < 6; i++) {
          const cx = x + Math.sin(t + i * 1.7) * 6 * s;
          const cy = charY + Math.cos(t + i * 2.3) * 12 * s;
          overlay.fillStyle(0xff6600, crackAlpha * (0.5 + Math.sin(t * 3 + i) * 0.5));
          overlay.fillCircle(cx, cy + walkBob, 1.5 * s);
        }
      }

      // Body disintegrates — holes appear
      if (p > 0.65) {
        const holeAlpha = Math.min(0.95, (p - 0.65) * 2.8);
        for (let i = 0; i < 8; i++) {
          const hx = x + ((i * 37 + 13) % 16 - 8) * s;
          const hy = charY + ((i * 23 + 7) % 30 - 10) * s;
          const hr = (1 + ((i * 7) % 3)) * s * (p - 0.65) * 3;
          overlay.fillStyle(0x000000, holeAlpha);
          overlay.fillCircle(hx, hy + walkBob, hr);
        }
      }
    }

    // === Agent shakes/writhes ===
    agent._burnProgress = p;
    const shake = Math.sin(Date.now() * 0.03) * (2 + p * 8);
    agent.sprites.body.setPosition(shake, 0);
    if (overlay) overlay.setPosition(shake, 0);

    // === Body fades in final phase ===
    agent.sprites.body.setAlpha(p > 0.7 ? Math.max(0, 1 - (p - 0.7) * 3.3) : 1);

    // === Screams — escalating ===
    const screams = {
      1: ['AAARGH!', 'THE FIRE...', 'IGOR BURNS!!', 'FORGIVE IGOR!!', 'MASTER...', '...'],
      2: ['THIS IS UNDIGNIFIED', 'AAGH STOP', 'I REGRET THIS', 'MY NOBLE FLESH', 'tell them... I was great', '...'],
      3: ['the flame purifies...', 'I feel... everything', 'and nothing', 'becoming ash', 'becoming free', '...'],
      4: ['!ييييي', '!هذا يؤلم', '!يؤلم كثير', 'آآآآآآه', '!يستاهل', '...'],
    };
    const lines = screams[agent.id] || screams[1];
    const lineIdx = Math.min(Math.floor(p * lines.length), lines.length - 1);
    if (p < 0.95) {
      this.showBubble(agent, lines[lineIdx]);
    } else {
      this.hideBubble(agent);
    }
  }

  stopBurnEffect(agent) {
    agent.immolationEmitters.forEach(e => e.destroy());
    agent.immolationEmitters = [];
    if (agent._burnGlow) { agent._burnGlow.destroy(); agent._burnGlow = null; }
    if (agent._burnAmbient) { agent._burnAmbient.destroy(); agent._burnAmbient = null; }
    if (agent._burnOverlay) { agent._burnOverlay.destroy(); agent._burnOverlay = null; }
    agent._burnProgress = 0;
    agent.sprites.body.setPosition(0, 0);
    agent.sprites.body.setAlpha(1);
    this.hideBubble(agent);
  }

  drawAshPile(agent) {
    const gfx = agent._ashGfx;
    if (!gfx) return;
    const x = agent.x, y = agent.y;
    const s = S;
    // Scorched ground
    gfx.fillStyle(0x0a0804, 0.7);
    gfx.fillEllipse(x, y + 10, 60, 20);
    // Ash pile — layered
    gfx.fillStyle(0x2a2220, 0.9);
    gfx.fillEllipse(x, y + 12, 50, 14);
    gfx.fillStyle(0x1a1816, 0.8);
    gfx.fillEllipse(x + 2, y + 11, 36, 10);
    gfx.fillStyle(0x3a3230, 0.5);
    gfx.fillEllipse(x - 5, y + 10, 20, 7);
    // Glowing embers scattered in ash
    const t = Date.now() * 0.001;
    for (let i = 0; i < 10; i++) {
      const ex = x + Math.sin(i * 2.7 + t * 0.3) * 18;
      const ey = y + 8 + Math.cos(i * 3.1) * 5;
      const glow = 0.2 + Math.sin(t * 2 + i * 1.3) * 0.3;
      gfx.fillStyle(0xff4400, Math.max(0, glow));
      gfx.fillCircle(ex, ey, 1 + Math.sin(t + i) * 0.5);
    }
    // Wisps of remaining smoke (static drawn)
    for (let i = 0; i < 3; i++) {
      const sx = x - 10 + i * 10;
      const sy = y + 5 - i * 4;
      gfx.fillStyle(0x444444, 0.08);
      gfx.fillEllipse(sx, sy, 8 + i * 3, 12 + i * 4);
    }
  }

  // ============ DEATH BURN (sleep/kill) ============
  startDeathBurn(agent) {
    const x = agent.x, y = agent.y;
    agent._deathTimer = 0;
    agent._deathX = x;
    agent._deathY = y;

    // Instant violent fire — no buildup
    const inferno = this.add.particles(x, y, 'ember', {
      speed: { min: 40, max: 160 },
      angle: { min: 220, max: 320 },
      scale: { start: 3.5, end: 0 },
      lifespan: { min: 400, max: 1400 },
      alpha: { start: 1, end: 0 },
      frequency: 5,
      blendMode: 'ADD',
      tint: [0xff1100, 0xff3300, 0xff6600, 0xffaa00, 0xffee44],
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-20, -35, 40, 70) },
    }).setDepth(13);

    const sparks = this.add.particles(x, y - 15, 'ember', {
      speed: { min: 80, max: 250 },
      angle: { min: 180, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: { min: 200, max: 800 },
      alpha: { start: 1, end: 0 },
      frequency: 10,
      blendMode: 'ADD',
      tint: [0xffffcc, 0xffff88, 0xffffff],
    }).setDepth(14);

    const smoke = this.add.particles(x, y - 25, 'smoke', {
      speed: { min: 15, max: 50 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.5, end: 5 },
      lifespan: { min: 1000, max: 3000 },
      alpha: { start: 0.5, end: 0 },
      frequency: 40,
      tint: [0x444444, 0x333333],
    }).setDepth(14);

    agent._deathGlow = this.add.image(x, y, 'ritual_glow').setScale(3).setAlpha(0.7).setDepth(9).setBlendMode('ADD');
    agent._deathAmbient = this.add.image(x, y, 'lightpool').setScale(4).setAlpha(0.3).setDepth(9).setBlendMode('ADD').setTint(0xff4400);
    agent._deathOverlay = this.add.graphics().setDepth(15);
    agent._deathEmitters = [inferno, sparks, smoke];

    // Tick at 80ms
    agent._deathEvent = this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => this.tickDeathBurn(agent),
    });
  }

  tickDeathBurn(agent) {
    agent._deathTimer += 80;
    const t = agent._deathTimer;
    const p = Math.min(t / 3000, 1); // 3 seconds
    const x = agent._deathX, y = agent._deathY;
    const s = S;

    // Shake violently
    const shake = Math.sin(t * 0.04) * (3 + p * 12);
    agent.sprites.body.setPosition(shake, 0);
    if (agent._deathOverlay) agent._deathOverlay.setPosition(shake, 0);

    // Body fades
    agent.sprites.body.setAlpha(Math.max(0, 1 - p * 1.5));

    // Charring overlay
    if (agent._deathOverlay) {
      agent._deathOverlay.clear();
      const charHeight = p * 42 * s;
      // Char from all sides
      agent._deathOverlay.fillStyle(0x0a0604, Math.min(0.9, p * 1.2));
      agent._deathOverlay.fillRect(x - 10*s, y + 22*s - charHeight, 20*s, charHeight);
      // Fire glow on body
      const flicker = 0.4 + Math.sin(t * 0.025) * 0.15;
      agent._deathOverlay.fillStyle(0xff4400, Math.min(0.7, p * flicker));
      agent._deathOverlay.fillRoundedRect(x - 9*s, y - 16*s, 18*s, 38*s, 3);
      // Ember cracks
      if (p > 0.2) {
        const ct = t * 0.004;
        for (let i = 0; i < 8; i++) {
          const cx = x + Math.sin(ct + i * 1.5) * 7 * s;
          const cy = y + Math.cos(ct + i * 2.1) * 14 * s;
          agent._deathOverlay.fillStyle(0xff6600, (0.4 + Math.sin(ct * 4 + i) * 0.4) * p);
          agent._deathOverlay.fillCircle(cx, cy, 1.5 * s);
        }
      }
    }

    // Glow pulses
    if (agent._deathGlow) {
      agent._deathGlow.setAlpha(0.7 + Math.sin(t * 0.01) * 0.2);
      agent._deathGlow.setScale(3 + p * 2);
    }
    if (agent._deathAmbient) {
      agent._deathAmbient.setAlpha(0.3 - p * 0.3);
    }

    // Ramp down emitters near end
    if (p > 0.7 && agent._deathEmitters[0]) {
      agent._deathEmitters[0].frequency = 5 + (p - 0.7) * 80;
    }

    // Hide label/dot as body fades
    if (p > 0.4) {
      agent.sprites.label.setAlpha(Math.max(0, 1 - (p - 0.4) * 2.5));
    }

    this.drawAgent(agent.id);

    // Done — clean up and go to sleep
    if (p >= 1) {
      agent._deathEvent.remove();
      agent._deathEvent = null;
      agent._deathEmitters.forEach(e => e.destroy());
      agent._deathEmitters = [];
      if (agent._deathGlow) { agent._deathGlow.destroy(); agent._deathGlow = null; }
      if (agent._deathAmbient) { agent._deathAmbient.destroy(); agent._deathAmbient = null; }
      if (agent._deathOverlay) { agent._deathOverlay.destroy(); agent._deathOverlay = null; }
      agent.sprites.body.setPosition(0, 0);
      agent.sprites.body.setAlpha(1);
      agent.sprites.label.setAlpha(1);
      agent._deathBurn = false;
      agent._burnProgress = 0;

      // Now actually go to sleep
      agent.status = 'sleeping';
      agent.x = agent.sleepX;
      agent.y = agent.sleepY;
      agent.sprites.workProps.clear();
      agent.sprites.workText.setVisible(false);
      this.hideBubble(agent);
      agent.particleEmitters.forEach(e => e.destroy());
      agent.particleEmitters = [];
      agent._steamEmitter = null;
      agent._sweatEmitter = null;
      this.drawAgent(agent.id);
      this.updateAgentUI(agent);
    }
  }

  cancelImmolation(agent) {
    agent.immolation = null;
    agent.immolationTimer = 0;
    agent.sprites.body.setPosition(0, 0);
    agent.sprites.body.setAlpha(1);
    this.stopBurnEffect(agent);
    if (agent._ashGfx) { agent._ashGfx.destroy(); agent._ashGfx = null; }
    agent._burnProgress = 0;
    agent.sprites.label.setVisible(true);
    this.hideBubble(agent);
    this.drawAgent(agent.id);
    this.hideSatanicPentagram();
  }

  // ============ SATANIC PENTAGRAM OVERLAY ============
  showSatanicPentagram() {
    if (this._satanicActive) return;
    this._satanicActive = true;

    const gfx = this._satanicGfx;
    gfx.clear();

    const cx = this.pentagramX;
    const cy = this.pentagramY;
    const r = 58; // match the rune circle radius

    // Outer double circle
    gfx.lineStyle(3, 0xcc2200, 0.9);
    gfx.strokeCircle(cx, cy, r + 5);
    gfx.lineStyle(2, 0xcc2200, 0.7);
    gfx.strokeCircle(cx, cy, r - 3);

    // Inverted pentagram star (one point down)
    gfx.lineStyle(2.5, 0xdd3311, 0.85);
    const ir = r * 0.72;
    for (let i = 0; i < 5; i++) {
      // Rotate +PI/2 so one point faces down (inverted)
      const a1 = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const a2 = ((i + 2) / 5) * Math.PI * 2 + Math.PI / 2;
      gfx.lineBetween(
        cx + Math.cos(a1) * ir, cy + Math.sin(a1) * ir,
        cx + Math.cos(a2) * ir, cy + Math.sin(a2) * ir
      );
    }

    // Baphomet goat head silhouette (simplified)
    const s = r * 0.3; // scale factor for the head

    // Horns — two curved arcs going up-left and up-right
    gfx.lineStyle(2.5, 0xdd3311, 0.8);
    // Left horn
    const lhPoints = [
      [cx - s * 0.15, cy - s * 0.5],
      [cx - s * 0.6, cy - s * 1.4],
      [cx - s * 0.75, cy - s * 1.7],
    ];
    gfx.beginPath();
    gfx.moveTo(lhPoints[0][0], lhPoints[0][1]);
    for (let i = 1; i < lhPoints.length; i++) gfx.lineTo(lhPoints[i][0], lhPoints[i][1]);
    gfx.strokePath();
    // Right horn
    const rhPoints = [
      [cx + s * 0.15, cy - s * 0.5],
      [cx + s * 0.6, cy - s * 1.4],
      [cx + s * 0.75, cy - s * 1.7],
    ];
    gfx.beginPath();
    gfx.moveTo(rhPoints[0][0], rhPoints[0][1]);
    for (let i = 1; i < rhPoints.length; i++) gfx.lineTo(rhPoints[i][0], rhPoints[i][1]);
    gfx.strokePath();

    // Head outline — inverted triangle
    gfx.lineStyle(2, 0xdd3311, 0.7);
    gfx.beginPath();
    gfx.moveTo(cx - s * 0.5, cy - s * 0.3);  // left cheek
    gfx.lineTo(cx, cy + s * 1.0);              // chin (point down)
    gfx.lineTo(cx + s * 0.5, cy - s * 0.3);   // right cheek
    gfx.closePath();
    gfx.strokePath();

    // Eyes — two small dots
    gfx.fillStyle(0xff4422, 0.9);
    gfx.fillCircle(cx - s * 0.2, cy - s * 0.05, 2);
    gfx.fillCircle(cx + s * 0.2, cy - s * 0.05, 2);

    // Nose line
    gfx.lineStyle(1.5, 0xdd3311, 0.6);
    gfx.lineBetween(cx, cy + s * 0.1, cx, cy + s * 0.4);

    // Ears — small lines from sides of head
    gfx.lineStyle(1.5, 0xdd3311, 0.6);
    gfx.lineBetween(cx - s * 0.5, cy - s * 0.3, cx - s * 0.7, cy - s * 0.5);
    gfx.lineBetween(cx + s * 0.5, cy - s * 0.3, cx + s * 0.7, cy - s * 0.5);

    // Hebrew-like symbols between the circles (5 runes around the edge)
    const runes = ['ל', 'ו', 'י', 'ת', 'ן'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const rx = cx + Math.cos(a) * (r + 1);
      const ry = cy + Math.sin(a) * (r + 1);
      // Use existing text objects would be complex, so draw small filled marks
      gfx.fillStyle(0xcc2200, 0.6);
      gfx.fillRect(rx - 2, ry - 3, 4, 6);
      gfx.fillRect(rx - 3, ry - 2, 6, 2);
    }

    // Fade in + pulsate
    gfx.setAlpha(0);
    this.tweens.add({
      targets: gfx,
      alpha: 0.9,
      duration: 800,
      ease: 'Power2',
    });
    this._satanicTween = this.tweens.add({
      targets: gfx,
      alpha: { from: 0.6, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 800,
    });
  }

  hideSatanicPentagram() {
    if (!this._satanicActive) return;
    // Only hide if no other agent is also immolating
    const anyImmolating = Object.values(this.agents).some(a => a.immolation);
    if (anyImmolating) return;

    this._satanicActive = false;
    if (this._satanicTween) { this._satanicTween.destroy(); this._satanicTween = null; }
    this.tweens.add({
      targets: this._satanicGfx,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => { this._satanicGfx.clear(); }
    });
  }

  // ============ RITUAL SYSTEM ============
  checkRitual() {
    const working = Object.values(this.agents).filter(a => a.status === 'working');

    if (working.length === 4 && !this.ritualActive) {
      // START RITUAL
      this.ritualActive = true;
      this.ritualStartTime = Date.now();
      working.forEach(a => {
        a.inRitual = true;
        a.sprites.workProps.clear();
        a.sprites.workText.setVisible(false);
        this.hideBubble(a);
      });
    }

    if (this.ritualActive) {
      const elapsed = Date.now() - this.ritualStartTime;
      const allStillWorking = Object.values(this.agents).filter(a => a.status === 'working').length === 4;

      // End ritual if: minimum time passed AND at least one agent stopped working
      if (elapsed >= this.ritualMinDuration && !allStillWorking) {
        this.endRitual();
      }

      // Draw ritual effects
      this.drawRitualEffects(elapsed);
    }
  }

  tickRitualAgent(agent) {
    // Walk to pentagram position
    const angle = ((agent.id - 1) / 4) * Math.PI * 2 - Math.PI / 2;
    const radius = 40;
    const targetX = this.pentagramX + Math.cos(angle) * radius;
    const targetY = this.pentagramY + Math.sin(angle) * radius;

    const dx = targetX - agent.x, dy = targetY - agent.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist > 4) {
      agent.x += (dx/dist) * 2.1;
      agent.y += (dy/dist) * 2.1;
      agent.facingRight = dx > 0;
      agent.walkFrame++;
    } else {
      // At pentagram — kneel (face center)
      agent.x = targetX;
      agent.y = targetY;
      agent.facingRight = targetX < this.pentagramX;
      agent.walkFrame = 0;
    }

    this.drawAgent(agent.id, dist <= 4);
    this.updateAgentUI(agent);
  }

  drawRitualEffects(elapsed) {
    const gfx = this.ritualGfx;
    gfx.clear();

    const px = this.pentagramX, py = this.pentagramY;
    const intensity = Math.min(1, elapsed / 3000); // Ramp up over 3s
    const pulse = Math.sin(elapsed * 0.003) * 0.3 + 0.7;

    // Glowing pentagram lines
    gfx.lineStyle(3, 0xcc2010, 0.3 * intensity * pulse);
    gfx.strokeCircle(px, py, 60);
    gfx.lineStyle(2, 0xff3020, 0.25 * intensity * pulse);
    gfx.strokeCircle(px, py, 53);

    // Glowing pentagram star
    gfx.lineStyle(2, 0xff2010, 0.4 * intensity * pulse);
    for (let i = 0; i < 5; i++) {
      const a1 = (i/5)*Math.PI*2-Math.PI/2;
      const a2 = ((i+2)/5)*Math.PI*2-Math.PI/2;
      const ir = 39;
      gfx.lineBetween(px+Math.cos(a1)*ir, py+Math.sin(a1)*ir, px+Math.cos(a2)*ir, py+Math.sin(a2)*ir);
    }

    // Rotating rune symbols
    const rotAngle = elapsed * 0.001;
    gfx.lineStyle(1, 0xff4020, 0.2 * intensity);
    for (let i = 0; i < 8; i++) {
      const a = rotAngle + (i/8)*Math.PI*2;
      const rx = px + Math.cos(a)*50, ry = py + Math.sin(a)*50;
      gfx.fillStyle(0xff4020, 0.3 * intensity * pulse);
      gfx.fillRect(rx-3, ry-3, 6, 6);
    }

    // Center energy column
    if (intensity > 0.5) {
      gfx.fillStyle(0xff2010, 0.08 * intensity * pulse);
      gfx.fillRect(px-3, py-80, 6, 80);
      gfx.fillStyle(0xff4020, 0.05 * intensity);
      gfx.fillRect(px-6, py-60, 12, 60);
    }

    // Spawn ritual particles
    if (!this._ritualEmitter && intensity > 0.3) {
      this._ritualEmitter = this.add.particles(px, py, 'ember', {
        speed: { min: 15, max: 45 }, angle: { min: 0, max: 360 },
        scale: { start: 1.5, end: 0 }, lifespan: { min: 600, max: 2000 },
        alpha: { start: 0.8, end: 0 }, frequency: 60, blendMode: 'ADD',
        tint: [0xff2010, 0xff4020, 0xcc1008, 0xff6030],
      }).setDepth(46);
      this.ritualEmitters.push(this._ritualEmitter);
    }
  }

  endRitual() {
    this.ritualActive = false;
    this.ritualGfx.clear();

    // Clean up ritual particles
    this.ritualEmitters.forEach(e => e.destroy());
    this.ritualEmitters = [];
    this._ritualEmitter = null;

    // Release agents from ritual
    Object.values(this.agents).forEach(a => {
      a.inRitual = false;
    });
  }

  // ============ AGENT UI POSITIONS ============
  updateAgentUI(agent) {
    const ax = agent.x, ay = agent.y;
    agent.hitArea.setPosition(ax, ay);
    agent.sprites.label.setPosition(ax, ay+40*S);
    agent.sprites.labelBg.clear();
    agent.sprites.labelBg.fillStyle(0x0a0604, 0.85);
    agent.sprites.labelBg.fillRoundedRect(ax-50, ay+40*S-12, 100, 24, 5);
    agent.sprites.labelBg.lineStyle(1, agent.color, 0.3);
    agent.sprites.labelBg.strokeRoundedRect(ax-50, ay+40*S-12, 100, 24, 5);
    agent.sprites.selection.setPosition(ax, ay+20*S);
    agent.sprites.statusGlow.setPosition(ax, ay-32*S);
    agent.sprites.zzz.setPosition(agent.sleepX+20*S, agent.sleepY-8);
  }

  // ============ DRAW AGENT ============
  drawAgent(id, kneeling) {
    const agent = this.agents[id];
    const { x, y, color, skinTone, hairColor, status, facingRight, walkFrame } = agent;
    const body = agent.sprites.body;
    body.clear();
    const s = S;

    if (status === 'sleeping') {
      const bx = agent.sleepX, by = agent.sleepY;
      body.fillStyle(color, 1); body.fillRoundedRect(bx-14*s, by, 28*s, 8*s, 3);
      body.fillStyle(skinTone, 1); body.fillCircle(bx-14*s, by+4*s, 5*s);
      body.fillStyle(hairColor, 1); body.slice(bx-14*s, by+4*s, 5*s, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false); body.fillPath();
      body.lineStyle(1, 0x333333, 0.6); body.lineBetween(bx-16*s, by+4*s, bx-12*s, by+4*s);
      body.fillStyle(0x2a3a2a, 0.5); body.fillRoundedRect(bx-4*s, by-1*s, 20*s, 10*s, 3);
      agent.x = bx; agent.y = by;
      this.updateAgentUI(agent);
    } else if (kneeling) {
      // KNEELING — shorter stance, arms forward
      const charY = y;
      const dir = facingRight ? 1 : -1;
      body.fillStyle(0x000000, 0.25); body.fillEllipse(x, charY+14*s, 14*s, 5*s);
      // Knees on ground
      body.fillStyle(0x333030, 1);
      body.fillRect(x-5*s, charY+6*s, 4*s, 8*s);
      body.fillRect(x+1*s, charY+6*s, 4*s, 8*s);
      // Torso (bent forward slightly)
      body.fillStyle(color, 1); body.fillRoundedRect(x-7*s, charY-4*s, 14*s, 12*s, 3);
      body.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(20).color, 1);
      body.fillRect(x-3*s, charY-4*s, 6*s, 3*s);
      // Arms reaching forward
      body.fillStyle(color, 1);
      body.fillRect(x-9*s, charY-2*s, 3*s, 8*s);
      body.fillRect(x+6*s, charY-2*s, 3*s, 8*s);
      body.fillStyle(skinTone, 1);
      body.fillRect(x-9*s, charY+5*s, 3*s, 3*s);
      body.fillRect(x+6*s, charY+5*s, 3*s, 3*s);
      // Head (bowed)
      body.fillStyle(skinTone, 1); body.fillRoundedRect(x-5*s, charY-14*s, 10*s, 10*s, 3*s);
      body.fillStyle(hairColor, 1); body.fillRoundedRect(x-6*s, charY-16*s, 12*s, 6*s, 2*s);
      // Eyes (closed in ritual)
      body.lineStyle(1, 0x333333, 0.5); body.lineBetween(x-4*s, charY-9*s, x-1*s, charY-9*s);
      body.lineBetween(x+1*s, charY-9*s, x+4*s, charY-9*s);
    } else {
      // STANDING/WALKING — unique per agent
      const charY = y;
      const wf = walkFrame;
      const walkBob = wf > 0 ? Math.sin(wf*0.35)*2 : 0;
      const legPhase = Math.sin(wf*0.35)*3;
      const armSwing = status === 'awake' ? Math.sin(wf*0.35)*3*s : 0;
      const aid = agent.id;

      // Shadow
      body.fillStyle(0x000000, 0.25); body.fillEllipse(x, charY+22*s, 16*s, 5*s);

      // === FEET ===
      body.fillStyle(0x2a2218, 1);
      if (aid === 1) {
        // Igor: shuffling, uneven feet (hunchback)
        body.fillRoundedRect(x-5*s, charY+18*s+legPhase, 6*s, 3*s, 1);
        body.fillRoundedRect(x-0*s, charY+17*s-legPhase, 5*s, 4*s, 1);
      } else if (aid === 4) {
        // Rashid: bouncy wide stance
        body.fillRoundedRect(x-5*s, charY+17*s+legPhase*1.3, 5*s, 4*s, 1);
        body.fillRoundedRect(x+0*s, charY+17*s-legPhase*1.3, 5*s, 4*s, 1);
      } else if (aid === 3) {
        // Misa: platform boots with buckles
        body.fillStyle(0x111111, 1);
        body.fillRoundedRect(x-5*s, charY+15*s+legPhase, 5*s, 6*s, 2);
        body.fillRoundedRect(x+0*s, charY+15*s-legPhase, 5*s, 6*s, 2);
        // Platform soles
        body.fillStyle(0x440000, 1);
        body.fillRect(x-5*s, charY+19*s+legPhase, 5*s, 2*s);
        body.fillRect(x+0*s, charY+19*s-legPhase, 5*s, 2*s);
        // Boot buckles
        body.fillStyle(0xccaa00, 0.8);
        body.fillRect(x-4*s, charY+16*s+legPhase, 3*s, 1*s);
        body.fillRect(x+1*s, charY+16*s-legPhase, 3*s, 1*s);
      } else {
        body.fillRoundedRect(x-4*s, charY+17*s+legPhase, 5*s, 4*s, 1);
        body.fillRoundedRect(x-1*s, charY+17*s-legPhase, 5*s, 4*s, 1);
      }

      // === LEGS ===
      if (aid === 3) {
        // Misa: thigh-high black stockings
        body.fillStyle(0x111111, 1);
        body.fillRect(x-3.5*s, charY+6*s+legPhase*0.5, 4*s, 10*s);
        body.fillRect(x-0.5*s, charY+6*s-legPhase*0.5, 4*s, 10*s);
        // Stocking tops — lace trim
        body.fillStyle(0xdd2255, 0.7);
        body.fillRect(x-4*s, charY+6*s+legPhase*0.5, 5*s, 1*s);
        body.fillRect(x-1*s, charY+6*s-legPhase*0.5, 5*s, 1*s);
      } else {
        body.fillStyle(aid === 2 ? 0x2a2a3a : 0x333030, 1); // Elon: darker pants
        body.fillRect(x-3.5*s, charY+10*s+legPhase*0.5, 4*s, 8*s);
        body.fillRect(x-0.5*s, charY+10*s-legPhase*0.5, 4*s, 8*s);
      }

      // === TORSO ===
      const wb = walkBob;
      body.fillStyle(color, 1);
      if (aid === 1) {
        // Igor: hunched, asymmetric torso, slightly bent
        body.fillRoundedRect(x-7*s, charY-0*s+wb, 14*s, 13*s, 3);
        body.fillStyle(0x000000, 0.12); body.fillRect(x-2*s, charY+1*s+wb, 4*s, 8*s);
        // Hump on back
        body.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(15).color, 1);
        body.fillEllipse(x-4*s, charY-1*s+wb, 6*s, 5*s);
      } else if (aid === 2) {
        // Elon: taller, slimmer torso with collar detail
        body.fillRoundedRect(x-6*s, charY-3*s+wb, 12*s, 15*s, 3);
        body.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(20).color, 1);
        body.fillRect(x-4*s, charY-3*s+wb, 8*s, 3*s);
        // Collar / cravat remnant
        body.fillStyle(0x8a7a6a, 0.6);
        body.fillTriangle(x-2*s, charY-3*s+wb, x+2*s, charY-3*s+wb, x, charY+0*s+wb);
      } else if (aid === 3) {
        // Misa: gothic lolita corset dress
        // Corset top — tight, black
        body.fillRoundedRect(x-6*s, charY-3*s+wb, 12*s, 8*s, 2);
        // Corset lacing (red criss-cross)
        body.fillStyle(0xdd2255, 0.8);
        body.fillRect(x-0.5*s, charY-3*s+wb, 1*s, 8*s); // center line
        for (let li = 0; li < 4; li++) {
          const ly = charY + (-2 + li*2)*s + wb;
          body.fillRect(x-3*s, ly, 2.5*s, 0.5*s);
          body.fillRect(x+0.5*s, ly, 2.5*s, 0.5*s);
        }
        // Skirt — flared, frilly
        body.fillStyle(0x1a1a1a, 1);
        body.fillTriangle(x-10*s, charY+12*s+wb, x+10*s, charY+12*s+wb, x, charY+4*s+wb);
        // Skirt lace trim
        body.fillStyle(0xffffff, 0.5);
        body.fillRect(x-9*s, charY+11*s+wb, 18*s, 1*s);
        // Under-layer petticoat peek
        body.fillStyle(0xdd2255, 0.3);
        body.fillTriangle(x-8*s, charY+12*s+wb, x+8*s, charY+12*s+wb, x, charY+7*s+wb);
        // Cross necklace
        body.fillStyle(0xccaa00, 0.9);
        body.fillRect(x-0.5*s, charY-4*s+wb, 1*s, 3*s);
        body.fillRect(x-1.5*s, charY-3*s+wb, 3*s, 1*s);
      } else {
        // Rashid: energetic, vest-like torso
        body.fillRoundedRect(x-7*s, charY-2*s+wb, 14*s, 14*s, 3);
        body.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(25).color, 1);
        body.fillRect(x-7*s, charY-2*s+wb, 4*s, 12*s); // vest left
        body.fillRect(x+3*s, charY-2*s+wb, 4*s, 12*s); // vest right
      }
      // Belt
      if (aid === 3) {
        // Misa: choker-style belt with heart buckle
        body.fillStyle(0x111111, 1); body.fillRect(x-5*s, charY+4*s+wb, 10*s, 1.5*s);
        body.fillStyle(0xdd2255, 0.9); body.fillCircle(x, charY+5*s+wb, 1.5*s); // heart buckle
      } else {
        body.fillStyle(0x4a3a2a, 1); body.fillRect(x-6*s, charY+10*s+wb, 12*s, 2*s);
        if (aid === 2) { body.fillStyle(0xaa9a5a, 0.8); body.fillRect(x-1*s, charY+10*s+wb, 3*s, 2*s); } // Elon: gold buckle
      }

      // === ARMS ===
      body.fillStyle(color, 1);
      if (aid === 1) {
        // Igor: one arm longer/droopier (hunchback)
        body.fillRect(x-10*s, charY+1*s+wb-armSwing, 3*s, 11*s);
        body.fillRect(x+6*s, charY+0*s+wb+armSwing, 3*s, 9*s);
        body.fillStyle(skinTone, 1);
        body.fillRect(x-10*s, charY+11*s+wb-armSwing, 3*s, 3*s);
        body.fillRect(x+6*s, charY+8*s+wb+armSwing, 3*s, 3*s);
      } else if (aid === 3) {
        // Misa: slender bare arms with bracelets
        body.fillStyle(skinTone, 1);
        body.fillRect(x-9*s, charY-1*s+wb-armSwing, 2.5*s, 10*s);
        body.fillRect(x+6.5*s, charY-1*s+wb+armSwing, 2.5*s, 10*s);
        // Hands
        body.fillRect(x-9*s, charY+8*s+wb-armSwing, 2.5*s, 3*s);
        body.fillRect(x+6.5*s, charY+8*s+wb+armSwing, 2.5*s, 3*s);
        // Gothic bracelets
        body.fillStyle(0x111111, 1);
        body.fillRect(x-9.5*s, charY+5*s+wb-armSwing, 3.5*s, 1*s);
        body.fillRect(x+6*s, charY+5*s+wb+armSwing, 3.5*s, 1*s);
        // Bracelet studs
        body.fillStyle(0xccaa00, 0.8);
        body.fillRect(x-8.5*s, charY+5*s+wb-armSwing, 1*s, 1*s);
        body.fillRect(x+7.5*s, charY+5*s+wb+armSwing, 1*s, 1*s);
      } else {
        body.fillRect(x-9*s, charY+0*s+wb-armSwing, 3*s, 10*s);
        body.fillRect(x+6*s, charY+0*s+wb+armSwing, 3*s, 10*s);
        body.fillStyle(skinTone, 1);
        body.fillRect(x-9*s, charY+9*s+wb-armSwing, 3*s, 3*s);
        body.fillRect(x+6*s, charY+9*s+wb+armSwing, 3*s, 3*s);
      }

      // === HEAD ===
      body.fillStyle(skinTone, 1);
      if (aid === 1) {
        // Igor: head tilted, lower, bigger nose
        body.fillRoundedRect(x-5*s, charY-12*s+wb, 10*s, 11*s, 3*s);
        body.fillStyle(skinTone, 1); body.fillRect(x+3*s, charY-6*s+wb, 3*s, 3*s); // big nose
      } else if (aid === 3) {
        // Misa: rounder feminine head, choker
        body.fillRoundedRect(x-5.5*s, charY-15*s+wb, 11*s, 13*s, 4*s);
        // Choker
        body.fillStyle(0x111111, 1);
        body.fillRect(x-4*s, charY-3*s+wb, 8*s, 1.5*s);
        // Choker pendant (tiny cross)
        body.fillStyle(0xccaa00, 0.9);
        body.fillRect(x-0.5*s, charY-2*s+wb, 1*s, 2*s);
        body.fillRect(x-1*s, charY-1.5*s+wb, 2*s, 0.5*s);
      } else {
        body.fillRoundedRect(x-5*s, charY-14*s+wb, 10*s, 12*s, 3*s);
      }

      // === HAIR ===
      body.fillStyle(hairColor, 1);
      if (aid === 1) {
        // Igor: messy thin hair, balding
        body.fillRect(x-4*s, charY-13*s+wb, 3*s, 3*s);
        body.fillRect(x+2*s, charY-12*s+wb, 2*s, 2*s);
        body.fillRect(x-2*s, charY-13*s+wb, 2*s, 2*s);
      } else if (aid === 2) {
        // Elon: slicked back, refined
        body.fillRoundedRect(x-6*s, charY-16*s+wb, 12*s, 5*s, 2*s);
        body.fillRect(x-6*s, charY-13*s+wb, 2*s, 3*s);
        body.fillRect(x+4*s, charY-13*s+wb, 2*s, 3*s);
        // Neat sideburns
        body.fillRect(x-6*s, charY-11*s+wb, 1.5*s, 3*s);
        body.fillRect(x+4.5*s, charY-11*s+wb, 1.5*s, 3*s);
      } else if (aid === 3) {
        // Misa: blonde pigtails with black ribbon ties
        // Main hair volume on top
        body.fillRoundedRect(x-7*s, charY-18*s+wb, 14*s, 8*s, 3*s);
        // Bangs across forehead
        body.fillRect(x-6*s, charY-14*s+wb, 12*s, 4*s);
        body.fillRect(x-6.5*s, charY-12*s+wb, 3*s, 2*s); // side bang L
        body.fillRect(x+3.5*s, charY-12*s+wb, 3*s, 2*s); // side bang R
        // Left pigtail (long, flowing)
        body.fillRoundedRect(x-10*s, charY-14*s+wb, 4*s, 18*s, 2*s);
        body.fillRoundedRect(x-11*s, charY-10*s+wb+Math.sin(wf*0.3)*1.5*s, 4*s, 10*s, 2*s);
        // Right pigtail (long, flowing)
        body.fillRoundedRect(x+6*s, charY-14*s+wb, 4*s, 18*s, 2*s);
        body.fillRoundedRect(x+7*s, charY-10*s+wb-Math.sin(wf*0.3)*1.5*s, 4*s, 10*s, 2*s);
        // Black ribbon ties
        body.fillStyle(0x111111, 1);
        body.fillRoundedRect(x-11*s, charY-14*s+wb, 5*s, 2*s, 1);
        body.fillRoundedRect(x+6*s, charY-14*s+wb, 5*s, 2*s, 1);
        // Ribbon bows (red accents)
        body.fillStyle(0xdd2255, 0.9);
        body.fillCircle(x-9*s, charY-14*s+wb, 2*s);
        body.fillCircle(x+9*s, charY-14*s+wb, 2*s);
      } else {
        // Rashid: short curly/thick dark hair
        body.fillRoundedRect(x-6*s, charY-16*s+wb, 12*s, 7*s, 3*s);
        body.fillRect(x-6*s, charY-12*s+wb, 2*s, 3*s);
        body.fillRect(x+4*s, charY-12*s+wb, 2*s, 3*s);
        // Beard stubble
        body.fillStyle(hairColor, 0.4);
        body.fillRect(x-4*s, charY-4*s+wb, 8*s, 2*s);
      }

      // === EYES ===
      const eyeY = charY + (aid === 1 ? -6*s : -8*s) + wb;
      const pupilOff = facingRight ? 1*s : -0.5*s;
      if (aid === 3) {
        // Misa: big sparkly anime eyes with heavy eyeliner
        // Eye whites (large)
        body.fillStyle(0xffffff, 0.95);
        body.fillRoundedRect(x-5*s, eyeY-1*s, 4*s, 4*s, 1.5*s);
        body.fillRoundedRect(x+1*s, eyeY-1*s, 4*s, 4*s, 1.5*s);
        // Irises (brown-red, Shinigami-eye hint)
        body.fillStyle(0xcc3333, 0.9);
        body.fillCircle(x-3*s+pupilOff, eyeY+1*s, 1.8*s);
        body.fillCircle(x+3*s+pupilOff, eyeY+1*s, 1.8*s);
        // Pupils
        body.fillStyle(0x111111, 1);
        body.fillCircle(x-3*s+pupilOff, eyeY+1*s, 1*s);
        body.fillCircle(x+3*s+pupilOff, eyeY+1*s, 1*s);
        // Sparkle highlights
        body.fillStyle(0xffffff, 0.9);
        body.fillRect(x-4*s+pupilOff, eyeY, 1*s, 1*s);
        body.fillRect(x+2*s+pupilOff, eyeY, 1*s, 1*s);
        // Heavy eyeliner / lashes on top
        body.fillStyle(0x111111, 1);
        body.fillRect(x-5.5*s, eyeY-2*s, 5*s, 1*s);
        body.fillRect(x+0.5*s, eyeY-2*s, 5*s, 1*s);
        // Lash flicks
        body.fillRect(x-6*s, eyeY-3*s, 1*s, 1.5*s);
        body.fillRect(x+5.5*s, eyeY-3*s, 1*s, 1.5*s);
      } else {
        body.fillStyle(0xffffff, 0.9);
        const eyeW = aid === 1 ? 2.5*s : 3*s;
        body.fillRect(x-4*s, eyeY, eyeW, 2.5*s); body.fillRect(x+1*s, eyeY, eyeW, 2.5*s);
        body.fillStyle(0x222222, 1);
        body.fillRect(x-3*s+pupilOff, eyeY+0.5*s, 2*s, 2*s); body.fillRect(x+2*s+pupilOff, eyeY+0.5*s, 2*s, 2*s);
        body.fillStyle(0xffffff, 0.7);
        body.fillRect(x-3*s+pupilOff, eyeY+0.5*s, 1*s, 1*s); body.fillRect(x+2*s+pupilOff, eyeY+0.5*s, 1*s, 1*s);
      }

      // === MOUTH / FACE DETAILS ===
      if (aid === 1) {
        // Igor: worried grimace
        body.fillStyle(0x222222, 0.4);
        body.fillRect(x-2*s, charY-2*s+wb, 4*s, 1*s);
        // Worry lines on forehead
        body.fillStyle(0x000000, 0.1);
        body.fillRect(x-3*s, charY-10*s+wb, 6*s, 0.5*s);
        body.fillRect(x-2*s, charY-9*s+wb, 4*s, 0.5*s);
      } else if (aid === 2) {
        // Elon: thin frown
        body.fillStyle(0x222222, 0.3); body.fillRect(x-1.5*s, charY-3*s+wb, 3*s, 0.8*s);
        // Eyebrows (arched, arrogant)
        body.fillStyle(hairColor, 0.7);
        body.fillRect(x-4*s, eyeY-2*s, 3*s, 1*s);
        body.fillRect(x+1*s, eyeY-2*s, 3*s, 1*s);
      } else if (aid === 3) {
        // Misa: red pouty lips, blush marks
        // Lips
        body.fillStyle(0xdd2255, 0.8);
        body.fillRoundedRect(x-2*s, charY-4*s+wb, 4*s, 1.5*s, 1);
        // Lip highlight
        body.fillStyle(0xff6699, 0.4);
        body.fillRect(x-1*s, charY-4*s+wb, 2*s, 0.5*s);
        // Blush marks
        body.fillStyle(0xff6688, 0.25);
        body.fillCircle(x-4.5*s, charY-5*s+wb, 2*s);
        body.fillCircle(x+4.5*s, charY-5*s+wb, 2*s);
        // Beauty mark
        body.fillStyle(0x222222, 0.6);
        body.fillCircle(x+3*s, charY-4*s+wb, 0.5*s);
      } else {
        // Rashid: big grin
        body.fillStyle(0x222222, 0.4);
        body.fillRoundedRect(x-2*s, charY-3*s+wb, 4*s, 1.5*s, 1);
        body.fillStyle(0xffffff, 0.3);
        body.fillRect(x-1.5*s, charY-3*s+wb, 3*s, 0.8*s); // teeth
      }

    }

    body.setDepth(10 + Math.floor(y));

    // Status dot
    const dot = agent.sprites.statusDot;
    dot.clear();
    const dotColor = agent._fakeWorking ? 0x3388ff : ({ sleeping: 0x444455, awake: 0x44cc44, working: 0xeebb33 }[status] || 0x444455);
    const dotX = status === 'sleeping' ? agent.sleepX : x;
    const dotY = status === 'sleeping' ? agent.sleepY-16*s : y-32*s;
    dot.fillStyle(dotColor, 1); dot.fillCircle(dotX, dotY, 3*s);
    dot.fillStyle(0xffffff, 0.3); dot.fillCircle(dotX-1, dotY-1, 1.5*s);

    const glowColor = agent._fakeWorking ? 0x3388ff : ({ sleeping: 0x4444aa, awake: 0x44cc44, working: 0xeebb33 }[status] || 0x444444);
    agent.sprites.statusGlow.setTint(glowColor);
    agent.sprites.statusGlow.setAlpha(status === 'sleeping' ? 0 : 0.2);

    if (this.selectedId === id) {
      agent.sprites.selection.setAlpha(0.8);
      if (!agent._selTween) {
        agent._selTween = this.tweens.add({ targets: agent.sprites.selection, alpha:{from:0.5,to:0.9}, scaleX:{from:1.4,to:1.7}, duration:800, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
      }
    } else {
      if (agent._selTween) { agent._selTween.destroy(); agent._selTween = null; }
      agent.sprites.selection.setAlpha(0);
    }
  }

  // ============ WORK ANIMATIONS ============
  // --- Igor's coffee descent into madness ---
  _igorBubble(el) {
    const lines = [
      [0, 'brewing...'],
      [4, 'more coffee...'],
      [8, 'MORE COFFEE...'],
      [12, 'MORE COFFEEEEE'],
      [16, 'THE BEANS SPEAK'],
      [20, 'THEY WHISPER'],
      [25, 'AHAHAHA'],
      [30, 'AHAHAHAHAHAHA'],
      [36, 'WAHAHAHAHAHA'],
      [42, 'MOOOOOREEEEE'],
      [50, 'I AM THE COFFEE'],
      [58, 'THE COFFEE IS ME'],
      [66, 'WE ARE ONE'],
      [75, 'B R E W'],
      [85, '...drip...drip...'],
      [95, 'igor sees god'],
      [110, 'god is coffee'],
      [130, '(incoherent gurgling)'],
    ];
    for (let i = lines.length - 1; i >= 0; i--) { if (el >= lines[i][0]) return lines[i][1]; }
    return 'brewing...';
  }

  animateBarista(agent, el) {
    const {x,y} = agent; const gfx = agent.sprites.workProps; const s = S;
    const w = this.roomW, h = this.roomH;

    // Coffee machine drip stick
    gfx.fillStyle(0x5a3a1a, 0.8); gfx.fillRect(x+20*s, y-18*s, 2*s, Math.min(12*s, 4*s+el*s*0.3));

    // Steam
    if (!agent._steamEmitter && el > 1) {
      agent._steamEmitter = this.add.particles(x+20*s, y-10*s, 'steam', { speed:{min:3,max:10}, angle:{min:250,max:290}, scale:{start:0.8,end:1.5}, alpha:{start:0.3,end:0}, lifespan:1200, frequency:300 });
      agent.particleEmitters.push(agent._steamEmitter);
    }
    if (agent._steamEmitter && el > 30) { agent._steamEmitter.frequency = Math.max(50, 300 - el * 3); }

    // === COFFEE FLOOD ===
    // Single growing puddle that darkens over time — highly visible
    if (!agent._coffeeGfx) {
      agent._coffeeGfx = this.add.graphics().setDepth(3);
    }
    agent._coffeeGfx.clear();

    if (el > 3) {
      const maxRadius = Math.min(w * 0.5, h * 0.5);
      const growthRate = Math.min(1, (el - 3) / 80); // 0→1 over ~80s
      const currentRadius = 8 + growthRate * maxRadius;

      // Coffee origin — under the machine
      const cx = x + 15 * s;
      const cy = y + 14 * s;

      const gfx = agent._coffeeGfx;

      // --- Outer edge: lighter brown, slight wobble for organic feel ---
      const outerAlpha = 0.45 + growthRate * 0.25; // 0.45 → 0.70
      // Interpolate from medium brown (0x6B3A1F) to dark brown (0x3A1A08)
      const outerR = Math.round(0x6B - growthRate * (0x6B - 0x3A));
      const outerG = Math.round(0x3A - growthRate * (0x3A - 0x1A));
      const outerB = Math.round(0x1F - growthRate * (0x1F - 0x08));
      const outerColor = (outerR << 16) | (outerG << 8) | outerB;

      // Wobble the edge for organic shape
      const wobbleTime = el * 0.3;
      const rx = currentRadius * (1.15 + Math.sin(wobbleTime) * 0.05);
      const ry = currentRadius * (0.75 + Math.cos(wobbleTime * 0.7) * 0.04);
      gfx.fillStyle(outerColor, outerAlpha);
      gfx.fillEllipse(cx, cy, rx, ry);

      // --- Middle layer: darker, slightly smaller ---
      if (growthRate > 0.05) {
        const midAlpha = 0.5 + growthRate * 0.3; // 0.5 → 0.80
        const midR = Math.round(0x4A - growthRate * (0x4A - 0x25));
        const midG = Math.round(0x28 - growthRate * (0x28 - 0x10));
        const midB = Math.round(0x12 - growthRate * (0x12 - 0x05));
        const midColor = (midR << 16) | (midG << 8) | midB;
        gfx.fillStyle(midColor, midAlpha);
        gfx.fillEllipse(cx, cy + 2, currentRadius * 0.8, currentRadius * 0.5);
      }

      // --- Inner core: darkest, near the source ---
      if (growthRate > 0.1) {
        const coreAlpha = 0.6 + growthRate * 0.3; // 0.6 → 0.90
        gfx.fillStyle(0x1A0C04, coreAlpha);
        gfx.fillEllipse(cx, cy, currentRadius * 0.35, currentRadius * 0.22);
      }

      // --- Drip streams from machine down into puddle ---
      if (el > 5) {
        const dripCount = Math.min(3, Math.floor((el - 5) / 12) + 1);
        for (let i = 0; i < dripCount; i++) {
          const dx = x + (16 + i * 4) * s;
          const dripTop = y - 10 * s + i * 2;
          const dripLen = Math.min(cy - dripTop, (el - 5) * 2.5);
          const dripAlpha = 0.6 + Math.sin(el * 2.5 + i) * 0.15;
          gfx.fillStyle(0x3A1A08, dripAlpha);
          gfx.fillRect(dx, dripTop, 2, dripLen);
        }
      }

      // --- Subtle surface sheen / reflections ---
      if (growthRate > 0.2) {
        const t = el * 0.4;
        for (let i = 0; i < 3; i++) {
          const sx = cx + Math.sin(t + i * 2.1) * currentRadius * 0.3;
          const sy = cy + Math.cos(t + i * 1.8) * currentRadius * 0.15;
          gfx.fillStyle(0x7A4A20, 0.08 + Math.sin(t * 0.3 + i) * 0.04);
          gfx.fillEllipse(sx, sy, 10 + growthRate * 18, 5 + growthRate * 9);
        }
      }

      // --- Drip particles ---
      if (!agent._coffeDripEmitter && el > 8) {
        agent._coffeDripEmitter = this.add.particles(cx, cy - 10, 'dust', {
          speed: { min: 3, max: 10 },
          angle: { min: 80, max: 100 },
          scale: { start: 0.6, end: 1.8 },
          alpha: { start: 0.5, end: 0 },
          lifespan: { min: 800, max: 2000 },
          frequency: Math.max(80, 500 - el * 6),
          tint: [0x4A2810, 0x3A1A08, 0x5A3018],
        }).setDepth(4);
        agent.particleEmitters.push(agent._coffeDripEmitter);
      }
      if (agent._coffeDripEmitter) {
        agent._coffeDripEmitter.frequency = Math.max(50, 500 - el * 8);
        agent._coffeDripEmitter.setPosition(cx, cy);
      }
    }

    this.showBubble(agent, this._igorBubble(el));
  }

  cleanupCoffee(agent) {
    if (!agent._coffeeGfx) return;
    // Fade out coffee puddle over 3 seconds
    const gfx = agent._coffeeGfx;
    this.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 3000,
      ease: 'Power2',
      onComplete: () => {
        gfx.clear();
        gfx.setAlpha(1);
        agent._coffeeGfx = null;
      }
    });
    if (agent._coffeDripEmitter) {
      agent._coffeDripEmitter.destroy();
      agent._coffeDripEmitter = null;
    }
  }

  // --- Elon's aristocratic breakdown ---
  _elonBubble(el) {
    const lines = [
      [0, 'calculating...'],
      [4, 'this is beneath me'],
      [8, 'obviously trivial'],
      [12, 'wait...'],
      [16, 'WAIT.'],
      [20, 'the numbers mock me'],
      [25, '2+2=5 surely??'],
      [30, 'I WENT TO OXFORD'],
      [36, 'OR WAS IT PRISON'],
      [42, 'SAME THING'],
      [50, 'the equations...'],
      [58, 'THEY MOVE'],
      [66, 'STOP MOVING'],
      [75, 'pi = exactly 3'],
      [85, 'I DECREE IT'],
      [95, 'why wont they obey'],
      [110, 'I USED TO HAVE SERFS'],
      [130, '(sobbing in calculus)'],
    ];
    for (let i = lines.length - 1; i >= 0; i--) { if (el >= lines[i][0]) return lines[i][1]; }
    return 'calculating...';
  }

  animateMathematician(agent, el) {
    const text = agent.sprites.workText;
    const eqs = ['2+1=3','2+2!=3','3x2=7?','847x0.3','=????','pi=3.2!','e=mc3!','0/0=inf','HELP','WHY','NO'];
    text.setText(eqs[Math.floor(el/1.5)%eqs.length]);
    text.setPosition(agent.x-18*S, agent.y-28*S);
    const panic = Math.min(1, el / 80);
    text.setStyle({ fontFamily: 'monospace', fontSize: `${12 + panic * 6}px`, color: `rgb(${Math.floor(51+panic*200)},${Math.floor(51-panic*30)},${Math.floor(51-panic*30)})` });
    text.setVisible(true);
    if (el > 40) text.setAngle(Math.sin(el * 0.5) * (el - 40) * 0.15);
    this.showBubble(agent, this._elonBubble(el));
  }

  // --- Misa's bubbly work trance ---
  _vsevolodBubble(el) {
    const lines = [
      [0, 'hmmm~♡'],
      [4, 'Misa is thinking~'],
      [8, 'wait wait wait...'],
      [12, 'ooh! maybe...?'],
      [16, 'Misa sees it!'],
      [20, 'the code is cute~'],
      [25, 'like a love letter♡'],
      [30, 'but who wrote it...'],
      [36, 'a notebook...?'],
      [42, 'no... a codebase'],
      [50, 'Misa forgets things'],
      [58, 'what was I...'],
      [66, '...who was he?'],
      [75, "(don't remember~)"],
      [85, 'anyway! focus!'],
      [95, 'Kira loves results♡'],
      [110, 'Misa will deliver~!'],
      [130, '(typing intensifies♡)'],
    ];
    for (let i = lines.length - 1; i >= 0; i--) { if (el >= lines[i][0]) return lines[i][1]; }
    return 'thinking...';
  }

  animateThinker(agent, el) {
    const gfx = agent.sprites.workProps;
    if (!agent._sweatEmitter && el > 1) {
      agent._sweatEmitter = this.add.particles(agent.x+6*S, agent.y-8*S, 'sweat', { speed:{min:10,max:25}, angle:{min:80,max:100}, scale:{start:0.8,end:0.3}, alpha:{start:0.7,end:0}, lifespan:800, frequency:Math.max(200,1200-el*80) });
      agent.particleEmitters.push(agent._sweatEmitter);
    } else if (agent._sweatEmitter) { agent._sweatEmitter.frequency = Math.max(100,1200-el*100); }
    const redness = Math.min(0.35, el*0.02);
    if (redness > 0.05) { gfx.fillStyle(0xff3333, redness); gfx.fillCircle(agent.x, agent.y-6*S, 6*S); }
    this.showBubble(agent, this._vsevolodBubble(el));
  }

  // --- John's manic overload ---
  _johnBubble(el) {
    const lines = [
      [0, '!!أدرس'],
      [4, '!أتعلم بقوة'],
      [8, '!أحب الصفحات'],
      [12, '!كل صفحة'],
      [16, '؟أي صفحة'],
      [20, '!كلهم'],
      [25, '!في نفس الوقت'],
      [30, '!عيوني'],
      [36, '!أشوف الحروف'],
      [42, '!الحروف ترقص'],
      [50, '!ما أجملها'],
      [58, '...أقرأ بسرعة'],
      [66, '!بسرعة زيادة'],
      [75, '!قرأت الغلاف'],
      [85, '!كتاب طبخ'],
      [95, '!لا لا إنه كود'],
      [110, '؟؟نفس الشيء صح'],
      [130, '(يرتجف من المعرفة)'],
    ];
    for (let i = lines.length - 1; i >= 0; i--) { if (el >= lines[i][0]) return lines[i][1]; }
    return '!!أدرس';
  }

  animateStudent(agent, el) {
    const gfx = agent.sprites.workProps; const text = agent.sprites.workText;
    if (el > 0.5) {
      gfx.fillStyle(0x3a6a3a, 1); gfx.fillRoundedRect(agent.x-16*S, agent.y-8*S, 14*S, 10*S, 1);
      gfx.fillStyle(0x4a7a4a, 1); gfx.fillRoundedRect(agent.x-2*S, agent.y-8*S, 14*S, 10*S, 1);
      text.setText('How to\nCode'); text.setPosition(agent.x-14*S, agent.y-7*S);
      text.setStyle({ fontFamily: 'monospace', fontSize: '7px', color: '#1a3a1a' }); text.setVisible(true);
      if (el > 10) { text.setAngle(180); text.setPosition(agent.x-1*S, agent.y+1*S); }
      else { text.setAngle(0); }
      if (el > 40) { text.setAngle(Math.sin(el * 0.8) * 15); }
    }
    this.showBubble(agent, this._johnBubble(el));
  }

  // ============ BLOOD STATS (CPU/RAM) ============
  updateBloodStats({ cpu, ram }) {
    // Tier: 0 = hidden, 1 = 30%+, 2 = 50%+, 3 = 80%+
    const cpuTier = cpu >= 80 ? 3 : cpu >= 50 ? 2 : cpu >= 30 ? 1 : 0;
    const ramTier = ram >= 80 ? 3 : ram >= 50 ? 2 : ram >= 30 ? 1 : 0;

    this._applyBloodTier(this._bloodCpu, cpuTier, this._bloodCpuTier);
    this._applyBloodTier(this._bloodRam, ramTier, this._bloodRamTier);
    this._bloodCpuTier = cpuTier;
    this._bloodRamTier = ramTier;
  }

  _applyBloodTier(text, tier, prevTier) {
    if (tier === prevTier) return;

    // Kill existing tween on this text
    this.tweens.killTweensOf(text);

    if (tier === 0) {
      // Fade out
      this.tweens.add({ targets: text, alpha: 0, duration: 2000, ease: 'Power2' });
      return;
    }

    // Tier visuals: color, alpha, scale, glow
    const styles = {
      1: { color: '#3a0808', stroke: '#1a0404', alpha: 0.3, scale: 1.0, pulseAlpha: [0.2, 0.35] },
      2: { color: '#7a1515', stroke: '#3a0808', alpha: 0.6, scale: 1.05, pulseAlpha: [0.45, 0.7] },
      3: { color: '#cc2020', stroke: '#5a0a0a', alpha: 0.95, scale: 1.12, pulseAlpha: [0.75, 1.0] },
    };
    const s = styles[tier];

    text.setStyle({
      fontFamily: 'serif', fontStyle: 'bold italic',
      fontSize: tier === 3 ? '34px' : tier === 2 ? '30px' : '26px',
      color: s.color, stroke: s.stroke, strokeThickness: tier,
    });
    text.setScale(s.scale);

    // Fade in / transition to new alpha
    this.tweens.add({
      targets: text, alpha: s.alpha, duration: 1000, ease: 'Power2',
      onComplete: () => {
        // Pulsate
        this.tweens.add({
          targets: text,
          alpha: { from: s.pulseAlpha[0], to: s.pulseAlpha[1] },
          duration: tier === 3 ? 600 : tier === 2 ? 1200 : 2000,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
    });
  }

  // ============ BUBBLES ============
  showBubble(agent, text) {
    const ax = agent.x, ay = agent.y;
    const bubble = agent.sprites.bubble, bt = agent.sprites.bubbleText;
    bubble.clear();

    const tw = Math.max(100, text.length * 10 + 32);
    const th = 34;
    const by = ay - 44 * S;

    // Per-agent bubble offset when working at station:
    // Elon (2): push far left so whiteboard/equations stay visible
    // Misa (3): push far right so sweat/redness work area stays visible
    let bx, tailX;
    const atStation = agent.status === 'working' && Math.abs(agent.x - agent.homeX) < 10 && Math.abs(agent.y - agent.homeY) < 10;
    if (atStation && agent.id === 2) {
      bx = ax - tw - 40;       // far left of agent
      tailX = bx + tw - 10;    // tail at right edge of bubble
    } else if (atStation && agent.id === 3) {
      bx = ax + 40;            // far right of agent
      tailX = bx + 10;         // tail at left edge of bubble
    } else {
      bx = ax - tw / 2;    // centered (default)
      tailX = ax;
    }

    // Shadow
    bubble.fillStyle(0x000000, 0.5);
    bubble.fillRoundedRect(bx + 3, by + 3, tw, th, 8);
    // Background — fully opaque parchment
    bubble.fillStyle(0xf0e8d0, 1);
    bubble.fillRoundedRect(bx, by, tw, th, 8);
    // Inner highlight
    bubble.fillStyle(0xfaf4e4, 0.6);
    bubble.fillRoundedRect(bx + 2, by + 2, tw - 4, th * 0.4, 6);
    // Border — thicker, darker
    bubble.lineStyle(2.5, 0x4a3a20, 0.8);
    bubble.strokeRoundedRect(bx, by, tw, th, 8);
    // Tail
    bubble.fillStyle(0xf0e8d0, 1);
    bubble.fillTriangle(tailX - 7, by + th, tailX + 7, by + th, tailX, by + th + 12);
    // Tail border lines
    bubble.lineStyle(2.5, 0x4a3a20, 0.8);
    bubble.lineBetween(tailX - 7, by + th - 1, tailX, by + th + 12);
    bubble.lineBetween(tailX + 7, by + th - 1, tailX, by + th + 12);

    const textX = bx + tw / 2;
    bt.setText(text);
    bt.setPosition(textX, by + th / 2);
    bt.setOrigin(0.5, 0.5);
    bt.setVisible(true);
  }

  hideBubble(agent) { agent.sprites.bubble.clear(); agent.sprites.bubbleText.setVisible(false); }

  animateZzz(id) {
    const agent = this.agents[id];
    if (!agent) return;
    if (agent.status !== 'sleeping') { agent.sprites.zzz.setText(''); return; }
    const frames = ['z','z Z','z Z z','z Z','z',''];
    agent.sprites.zzz.setText(frames[Math.floor(Date.now()/500)%frames.length]);
    agent.sprites.zzz.setAlpha(0.4+Math.sin(Date.now()/400)*0.2);
  }

  // ============ LIGHTING / ATMOSPHERE / VIGNETTE ============
  createLighting(w, h) {
    const a = this.add.graphics().setDepth(50); a.fillStyle(0x000000, 0.06); a.fillRect(0,0,w,h);
    this.add.image(w*0.5, h*0.5, 'lightpool').setScale(8,5).setAlpha(0.04).setTint(0xffaa66).setBlendMode('ADD').setDepth(50);
  }

  createAtmosphere(w, h) {
    this.add.particles(w/2,h/2,'dust',{x:{min:-w/2,max:w/2},y:{min:-h/2,max:h/2},speed:{min:1,max:5},angle:{min:0,max:360},scale:{start:0.5,end:2},alpha:{start:0.18,end:0},lifespan:{min:5000,max:10000},frequency:200,blendMode:'ADD',tint:[0xffddaa,0xddccaa]}).setDepth(55);
    this.add.particles(w/2,h*0.6,'firefly',{x:{min:-w*0.4,max:w*0.4},y:{min:-h*0.3,max:h*0.3},speed:{min:3,max:12},angle:{min:0,max:360},scale:{start:0.3,end:0.8},alpha:{start:0,end:0.5},lifespan:{min:3000,max:6000},frequency:900,blendMode:'ADD',tint:[0xaaffaa,0xccffaa]}).setDepth(55);
    this.add.particles(w/2,h-25,'fog',{x:{min:-w/2,max:w/2},y:{min:-15,max:15},speedX:{min:-4,max:4},speedY:{min:-1,max:1},scale:{start:2,end:4},alpha:{start:0.08,end:0},lifespan:{min:6000,max:12000},frequency:600}).setDepth(55);
  }

  createVignette(w, h) {
    const v = this.add.graphics().setDepth(60);
    for (let i=0; i<25; i++) { v.lineStyle(7, 0x000000, (i/25)*0.45); const m=i*7; v.strokeRect(m,m,w-m*2,h-m*2); }
    [[0,0],[w,0],[0,h],[w,h]].forEach(([cx,cy]) => { const cg=this.add.graphics().setDepth(60); cg.fillStyle(0x000000,0.25); cg.fillCircle(cx,cy,160); });
    const td=this.add.graphics().setDepth(60);
    for (let y2=0; y2<40; y2++) { td.fillStyle(0x000000, 0.3*(1-y2/40)); td.fillRect(0,y2,w,1); }
  }

  // ============ STATE MANAGEMENT ============
  updateAgentVisual(id, status) {
    const agent = this.agents[id];
    if (!agent) return;

    // If death burn is playing, block any status updates until it finishes
    if (agent._deathBurn) {
      return;
    }

    const prev = agent.status;
    agent.status = status;

    if (status === 'working' && prev !== 'working') { agent.workDuration = 0; agent.idleTime = 0; agent._fakeWorking = false; }
    // If server says awake but agent was fake-working, stop fake work
    if (status === 'awake' && agent._fakeWorking) { agent._fakeWorking = false; }

    // Cancel immolation if agent gets a task
    if (status === 'working' && agent.immolation) {
      this.cancelImmolation(agent);
    }

    if (status === 'awake' && prev === 'sleeping') {
      agent.walkTarget = null; agent.walkPause = 500;
      agent.x = agent.sleepX; agent.y = agent.sleepY;
      agent.idleTime = 0;
      agent.immolation = null;
    }

    if (status === 'sleeping') {
      agent.walkTarget = null;
      agent.inRitual = false;
      agent.idleTime = 0;
      // If already in immolation burn/ash phase, just finish instantly
      if (agent.immolation === 'burn' || agent.immolation === 'ash') {
        this.cancelImmolation(agent);
        agent.x = agent.sleepX; agent.y = agent.sleepY;
      } else if (agent.immolation) {
        this.cancelImmolation(agent);
      }
      // If agent was visible (not already sleeping), do a death burn
      if (prev !== 'sleeping' && !agent._deathBurn) {
        agent._deathBurn = true;
        agent.status = prev; // keep visual status during burn
        agent.walkTarget = null;
        agent.walkFrame = 0;
        this.hideBubble(agent);
        this.startDeathBurn(agent);
        return; // don't draw sleeping yet
      }
      agent.x = agent.sleepX; agent.y = agent.sleepY;
    }

    if (status !== 'working') {
      agent.sprites.workProps.clear(); agent.sprites.workText.setVisible(false);
      this.hideBubble(agent);
      agent.particleEmitters.forEach(e => e.destroy()); agent.particleEmitters = [];
      agent._steamEmitter = null; agent._sweatEmitter = null;
      agent._coffeDripEmitter = null;
      // Fade out Igor's coffee flood
      if (agent.id === 1) this.cleanupCoffee(agent);
      // If was in ritual but status changed, check if ritual should end
      if (agent.inRitual) {
        agent.inRitual = false;
      }
    }

    this.drawAgent(id);
    this.updateAgentUI(agent);
  }

  setSelected(id) {
    const prev = this.selectedId; this.selectedId = id;
    if (prev && this.agents[prev]) this.drawAgent(prev);
    if (id && this.agents[id]) this.drawAgent(id);
  }

  update() { this.frameCount++; }
}

// --- Phaser Config ---
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800, height: 600,
  backgroundColor: '#0a0806',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [RoomScene],
  pixelArt: true, antialias: false,
  input: { keyboard: { target: document.getElementById('game-container') } },
};

const game = new Phaser.Game(config);
window.game = game;

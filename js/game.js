/* ============ INTRO VIDEO ============ */
(function introVideo() {
  const wrap = document.getElementById('intro-video-wrap');
  const video = document.getElementById('intro-video');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('intro-hint');

  if (!wrap || !video) {
    if (typeof boot === 'function') boot();
    return;
  }

  let finished = false;
  let unmuted = false;

  function finishIntro() {
    if (finished) return;
    finished = true;
    wrap.style.display = 'none';
    if (wrap.parentNode) wrap.remove();
    if (loading) {
      loading.style.display = '';
      loading.classList.add('on');
    }
    if (typeof boot === 'function' && !window.__booted) {
      window.__booted = true;
      setTimeout(boot, 50);
    }
  }

  function tryFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req && !document.fullscreenElement) {
      try { req.call(el); } catch (e) {}
    }
  }

  // Start muted so the video always appears
  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  video.play().catch(() => {});

  // After 80 seconds always finish
  setTimeout(finishIntro, 80000);

  video.addEventListener('error', finishIntro);
  video.addEventListener('ended', () => {
    video.currentTime = 0;
    video.play().catch(() => {});
  });

  // First interaction: unmute + fullscreen
  function onInteract() {
    if (!unmuted) {
      unmuted = true;
      video.muted = false;
      video.play().catch(() => {});
      tryFullscreen();
      if (hint) hint.style.display = 'none';
    }
  }

  wrap.addEventListener('click', onInteract);
  document.addEventListener('keydown', onInteract);
  document.addEventListener('touchstart', onInteract);

  // Second click after unmuted = skip
  wrap.addEventListener('click', () => {
    if (unmuted) finishIntro();
  });
})();

/* ============ ENGINE: math, noise, rng ============ */
'use strict';
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};

const M4 = {
  ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  lookAt(e, c, u) {
    const z = V3.norm(V3.sub(e, c)), x = V3.norm(V3.cross(u, z)), y = V3.cross(z, x);
    const o = new Float32Array(16);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
    o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
    o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
    o[12] = -V3.dot(x, e); o[13] = -V3.dot(y, e); o[14] = -V3.dot(z, e); o[15] = 1;
    return o;
  },
  trans(x, y, z) { const o = M4.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
  // compose a chain: M4.chain(A,B,C) = A*B*C
  chain(...ms) { let r = ms[0]; for (let i = 1; i < ms.length; i++) r = M4.mul(r, ms[i]); return r; }
};

/* ---- tileable value noise for texture synthesis ---- */
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const wrap = (a, p) => ((a % p) + p) % p;
function vnoise(x, y, s, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(wrap(xi, px), wrap(yi, py), s), b = hash2(wrap(xi + 1, px), wrap(yi, py), s);
  const c = hash2(wrap(xi, px), wrap(yi + 1, py), s), d = hash2(wrap(xi + 1, px), wrap(yi + 1, py), s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, s, px, py, oct) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(x * f, y * f, s + i * 17, px * f, py * f);
    n += a; f *= 2; a *= 0.5;
  }
  return sum / n;
}

/* ============ ENGINE: shaders, mesh builder, renderer ============ */
const SH = {};

SH.sceneVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vP; out vec3 vN; out vec2 vUV; out vec3 vC;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vP = w.xyz; vN = mat3(uModel) * aNor; vUV = aUV; vC = aCol;
  gl_Position = uVP * w;
}`;

SH.sceneFS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vP; in vec3 vN; in vec2 vUV; in vec3 vC;
uniform sampler2D uDiff; uniform sampler2D uNorm; uniform sampler2D uMap; uniform sampler2DShadow uShadow;
uniform mat4 uShadowVP; uniform vec3 uCam;
uniform vec3 uFP; uniform vec3 uFD; uniform vec3 uFC; uniform vec2 uFCone; uniform float uShTexel;
uniform vec4 uLP[6]; uniform vec3 uLC[6]; uniform int uNL;
uniform vec3 uEmis; uniform vec2 uSpec; uniform float uNormStr; uniform float uDirt;
uniform float uTime; uniform float uFog; uniform vec3 uFogCol; uniform vec3 uAmb;
uniform vec4 uMapInfo; uniform int uOcc; uniform float uAlpha;
layout(location=0) out vec4 outCol;

float h31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vn(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }

vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 tn){
  vec3 dp1=dFdx(p), dp2=dFdy(p); vec2 duv1=dFdx(uv), duv2=dFdy(uv);
  vec3 dp2perp=cross(dp2,N), dp1perp=cross(N,dp1);
  vec3 T=dp2perp*duv1.x+dp1perp*duv2.x;
  vec3 B=dp2perp*duv1.y+dp1perp*duv2.y;
  float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-12));
  return normalize(mat3(T*inv,B*inv,N)*tn);
}

float occl(vec3 p, vec3 lp){
  vec2 a=p.xz, b=lp.xz;
  for(int i=1;i<=12;i++){
    if(i>uOcc) break;
    float t=float(i)/float(uOcc+1);
    vec2 q=mix(a,b,t)/uMapInfo.z;
    vec2 uv=(floor(q)+.5)/uMapInfo.xy;
    if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) continue;
    if(texture(uMap,uv).r>.5) return 0.;
  }
  return 1.;
}

const vec2 POIS[8]=vec2[8](vec2(-.94,-.40),vec2(.95,-.77),vec2(-.09,-.93),vec2(.34,.29),vec2(-.92,.46),vec2(-.82,-.19),vec2(.44,.89),vec2(.69,-.2));

void main(){
  vec3 Ng=normalize(vN);
  vec4 tx=texture(uDiff,vUV);
  vec3 alb=pow(tx.rgb,vec3(2.2))*vC;
  vec3 tn=texture(uNorm,vUV).xyz*2.-1.; tn.xy*=uNormStr;
  vec3 N=perturb(Ng,vP,vUV,normalize(tn));
  float g=fbm3(vP*1.3); float g2=fbm3(vP*.27+7.);
  float dirt=mix(1.,.38+.62*g,uDirt);
  alb*=dirt;
  float st=smoothstep(.56,.74,g2)*uDirt;
  alb=mix(alb,alb*vec3(.5,.16,.11),st*.85);
  vec3 V=normalize(uCam-vP);
  float wet=smoothstep(.3,.8,fbm3(vP*.45+3.));
  float sp=uSpec.x*(.35+1.1*wet);
  vec3 col=alb*uAmb*(.55+.45*N.y);

  for(int i=0;i<6;i++){
    if(i>=uNL) break;
    vec3 Lv=uLP[i].xyz-vP; float d=length(Lv); float r=uLP[i].w;
    if(d>=r) continue;
    vec3 L=Lv/d; float ndl=max(dot(N,L),0.);
    float wrapL=ndl*.85+.15*max(dot(Ng,L),0.);
    if(wrapL<=.001) continue;
    float att=pow(clamp(1.-pow(d/r,4.),0.,1.),2.)/(d*d+1.);
    if(att<.0015) continue;
    float vis=occl(vP+Ng*.3,uLP[i].xyz);
    if(vis<.5) continue;
    vec3 H=normalize(L+V);
    float s=pow(max(dot(N,H),0.),uSpec.y)*sp*step(.0,dot(Ng,L));
    col+=(alb*wrapL+vec3(s))*uLC[i]*att;
  }

  // flashlight: spot + shadow map
  vec3 Fv=uFP-vP; float fd=length(Fv); vec3 FL=Fv/fd;
  float cosA=dot(-FL,uFD);
  float cone=smoothstep(uFCone.x,uFCone.y,cosA);
  if(cone>0.&&uFC.x>0.){
    float ndl=max(dot(N,FL),0.);
    vec4 s4=uShadowVP*vec4(vP+Ng*.035,1.);
    vec3 sc=s4.xyz/s4.w*.5+.5;
    float sh=1.;
    if(sc.z<1.&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.){
      sh=0.;
      float bias=.0009+.0025*(1.-ndl);
      for(int k=0;k<8;k++) sh+=texture(uShadow,vec3(sc.xy+POIS[k]*uShTexel*1.7,sc.z-bias));
      sh/=8.;
    }
    float att=1./(1.+.11*fd+.028*fd*fd);
    float hot=.55+.45*pow(cone,1.6);
    float ring=.92+.08*sin(cosA*180.+uTime*.0);
    vec3 H=normalize(FL+V);
    float s=pow(max(dot(N,H),0.),uSpec.y)*sp;
    col+=(alb*ndl+vec3(s))*uFC*att*cone*hot*ring*sh;
  }

  col+=uEmis*vC*tx.rgb;
  float dist=length(uCam-vP);
  float f=1.-exp(-uFog*uFog*dist*dist);
  col=mix(col,uFogCol,clamp(f,0.,1.));
  outCol=vec4(col,uAlpha);
}`;

SH.depthVS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform mat4 uModel;
void main(){ gl_Position = uVP * uModel * vec4(aPos,1.0); }`;
SH.depthFS = `#version 300 es
precision mediump float;
layout(location=0) out vec4 o;
void main(){ o=vec4(1.); }`;

SH.fsVS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  vUv = p; gl_Position = vec4(p*2.-1.,0.,1.);
}`;

SH.brightFS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uThr;
void main(){
  vec3 c=texture(uTex,vUv).rgb;
  float l=max(max(c.r,c.g),c.b);
  float k=clamp((l-uThr)/(l+.0001),0.,1.);
  o=vec4(c*k,1.);
}`;

SH.blurFS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 s=texture(uTex,vUv).rgb*.2270270270;
  s+=texture(uTex,vUv+uDir*1.3846153846).rgb*.3162162162; s+=texture(uTex,vUv-uDir*1.3846153846).rgb*.3162162162;
  s+=texture(uTex,vUv+uDir*3.2307692308).rgb*.0702702703; s+=texture(uTex,vUv-uDir*3.2307692308).rgb*.0702702703;
  o=vec4(s,1.);
}`;

SH.compFS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2;
uniform float uTime; uniform float uFear; uniform float uHit; uniform float uPulse; uniform float uGlitch;
uniform float uFade; uniform float uExp; uniform float uAspect; uniform float uBloom; uniform float uWhite;
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv=vUv; vec2 c=uv-.5;
  uv=.5+c*(1.-uPulse*.012-uHit*.05);
  float f2=uFear*uFear;
  uv+=vec2(sin(uv.y*38.+uTime*7.),cos(uv.x*31.+uTime*6.))*.0024*f2;
  if(uGlitch>0.){
    float row=floor(uv.y*46.); float r=h12(vec2(row,floor(uTime*16.)));
    if(r>1.-uGlitch*.45) uv.x+=(h12(vec2(row,9.))-.5)*.14*uGlitch;
  }
  float ca=.0011+uFear*.0055+uGlitch*.012+uHit*.02;
  vec2 d=uv-.5;
  vec3 col;
  col.r=texture(uScene,uv+d*ca*1.4).r;
  col.g=texture(uScene,uv).g;
  col.b=texture(uScene,uv-d*ca*1.4).b;
  vec3 bl=texture(uB1,uv).rgb*.55+texture(uB2,uv).rgb*1.0;
  col+=bl*uBloom;
  col*=uExp;
  col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  float l=dot(col,vec3(.299,.587,.114));
  col=mix(vec3(l),col,1.-uFear*.55);
  col*=mix(vec3(.9,1.0,1.08),vec3(1.07,1.0,.9),smoothstep(.08,.65,l));
  col=pow(max(col,vec3(0.)),vec3(1./2.2));
  float vg=1.-smoothstep(.22,.92,length(c*vec2(uAspect*.62+.38,1.)*1.3));
  col*=mix(.12+.2*(1.-uFear),1.,vg);
  col+=(h12(gl_FragCoord.xy+fract(uTime)*91.)-.5)*(.055+uFear*.05);
  col=mix(col,vec3(.55,.02,.03)*(.5+vg),uHit*.55);
  col*=uFade;
  col=mix(col,vec3(1.),uWhite);
  o=vec4(col,1.);
}`;

/* ---------- mesh builder: interleaved pos3 nor3 uv2 col3 ---------- */
class MB {
  constructor() { this.v = []; this.i = []; this.n = 0; }
  quad(p, nrm, col, uvs) {
    const a = p[0], b = p[1], d = p[3];
    const e1 = V3.sub(b, a), e2 = V3.sub(d, a);
    const flip = V3.dot(V3.cross(e1, e2), nrm) < 0;
    const base = this.n;
    for (let k = 0; k < 4; k++) {
      this.v.push(p[k][0], p[k][1], p[k][2], nrm[0], nrm[1], nrm[2], uvs[k][0], uvs[k][1], col[0], col[1], col[2]);
    }
    this.n += 4;
    if (!flip) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // box centred at (cx,cy,cz), optional yaw rotation about its centre
  box(cx, cy, cz, sx, sy, sz, col, rot, uvs) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, k = uvs || 1;
    const cr = rot ? Math.cos(rot) : 1, sr = rot ? Math.sin(rot) : 0;
    const T = q => [cx + q[0] * cr + q[2] * sr, cy + q[1], cz - q[0] * sr + q[2] * cr];
    const R = q => [q[0] * cr + q[2] * sr, q[1], -q[0] * sr + q[2] * cr];
    const faces = [
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0], sz, sy],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0], sz, sy],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0], sx, sz],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0], sx, sz],
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1], sx, sy],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1], sx, sy]
    ];
    for (const f of faces) {
      const w = f[5] * k, h = f[6] * k;
      this.quad([T(f[0]), T(f[1]), T(f[2]), T(f[3])], R(f[4]), col, [[0, 0], [w, 0], [w, h], [0, h]]);
    }
  }
  // cylinder / cone along Y, base at cy
  cyl(cx, cy, cz, r0, r1, h, seg, col, caps, uvs) {
    const k = uvs || 1, base = this.n;
    const slope = (r0 - r1) / h;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const nn = V3.norm([ca, slope, sa]);
      this.v.push(cx + ca * r0, cy, cz + sa * r0, nn[0], nn[1], nn[2], s / seg * TAU * r0 * k, 0, col[0], col[1], col[2]);
      this.v.push(cx + ca * r1, cy + h, cz + sa * r1, nn[0], nn[1], nn[2], s / seg * TAU * r0 * k, h * k, col[0], col[1], col[2]);
    }
    for (let s = 0; s < seg; s++) {
      const a = base + s * 2;
      this.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.n += (seg + 1) * 2;
    if (caps) {
      for (const top of [false, true]) {
        const r = top ? r1 : r0, y = top ? cy + h : cy, ny = top ? 1 : -1;
        if (r <= 0.0001) continue;
        const b0 = this.n;
        this.v.push(cx, y, cz, 0, ny, 0, .5, .5, col[0], col[1], col[2]);
        for (let s = 0; s <= seg; s++) {
          const a = s / seg * TAU;
          this.v.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, ny, 0, .5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5, col[0], col[1], col[2]);
        }
        for (let s = 0; s < seg; s++) {
          if (top) this.i.push(b0, b0 + 2 + s, b0 + 1 + s); else this.i.push(b0, b0 + 1 + s, b0 + 2 + s);
        }
        this.n += seg + 2;
      }
    }
  }
  sphere(cx, cy, cz, rx, ry, rz, seg, col) {
    const rings = Math.max(4, seg >> 1), base = this.n;
    for (let y = 0; y <= rings; y++) {
      const t = y / rings, a = t * PI, sy = Math.cos(a), r = Math.sin(a);
      for (let s = 0; s <= seg; s++) {
        const b = s / seg * TAU, x = Math.cos(b) * r, z = Math.sin(b) * r;
        const nn = V3.norm([x / rx, sy / ry, z / rz]);
        this.v.push(cx + x * rx, cy + sy * ry, cz + z * rz, nn[0], nn[1], nn[2], s / seg, t, col[0], col[1], col[2]);
      }
    }
    for (let y = 0; y < rings; y++) for (let s = 0; s < seg; s++) {
      const a = base + y * (seg + 1) + s, b = a + seg + 1;
      this.i.push(a, a + 1, b, a + 1, b + 1, b);
    }
    this.n += (rings + 1) * (seg + 1);
  }
}

/* ---------- renderer ---------- */
class Prog {
  constructor(gl, vs, fs) {
    this.gl = gl; this.loc = {};
    const mk = (t, s) => {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
      return sh;
    };
    this.p = gl.createProgram();
    gl.attachShader(this.p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.p);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(this.p));
  }
  use() { this.gl.useProgram(this.p); return this; }
  u(n) { if (!(n in this.loc)) this.loc[n] = this.gl.getUniformLocation(this.p, n); return this.loc[n]; }
  f(n, v) { this.gl.uniform1f(this.u(n), v); }
  i(n, v) { this.gl.uniform1i(this.u(n), v); }
  v2(n, a, b) { this.gl.uniform2f(this.u(n), a, b); }
  v3(n, a) { this.gl.uniform3f(this.u(n), a[0], a[1], a[2]); }
  v4(n, a) { this.gl.uniform4f(this.u(n), a[0], a[1], a[2], a[3]); }
  m4(n, m) { this.gl.uniformMatrix4fv(this.u(n), false, m); }
  fv4(n, arr) { this.gl.uniform4fv(this.u(n), arr); }
  fv3(n, arr) { this.gl.uniform3fv(this.u(n), arr); }
}

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', depth: true, stencil: false });
    if (!gl) throw new Error('WebGL2 غير مدعوم في هذا المتصفح');
    this.gl = gl; this.canvas = canvas;
    this.extF = gl.getExtension('EXT_color_buffer_float');
    this.extHF = gl.getExtension('EXT_color_buffer_half_float');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.hdr = !!(this.extF || this.extHF);
    this.scene = new Prog(gl, SH.sceneVS, SH.sceneFS);
    this.depth = new Prog(gl, SH.depthVS, SH.depthFS);
    this.bright = new Prog(gl, SH.fsVS, SH.brightFS);
    this.blur = new Prog(gl, SH.fsVS, SH.blurFS);
    this.comp = new Prog(gl, SH.fsVS, SH.compFS);
    this.emptyVAO = gl.createVertexArray();
    this.shRes = 0; this.w = 0; this.h = 0; this.samples = 4;
    this.makeShadow(2048);
  }
  makeShadow(res) {
    const gl = this.gl;
    if (this.shTex) gl.deleteTexture(this.shTex);
    if (this.shFbo) gl.deleteFramebuffer(this.shFbo);
    this.shRes = res;
    this.shTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, res, res, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  tex2D(w, h, fmt, ifmt, type, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  fboFor(tex) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }
  resize(w, h) {
    const gl = this.gl;
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const del = o => { if (!o) return; for (const k in o) { const x = o[k]; if (x instanceof WebGLTexture) gl.deleteTexture(x); else if (x instanceof WebGLFramebuffer) gl.deleteFramebuffer(x); else if (x instanceof WebGLRenderbuffer) gl.deleteRenderbuffer(x); } };
    del(this.rt);
    const half = this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, ifmt = this.hdr ? gl.RGBA16F : gl.RGBA8;
    const rt = {};
    rt.sceneTex = this.tex2D(w, h, gl.RGBA, ifmt, half, gl.LINEAR);
    rt.sceneFbo = this.fboFor(rt.sceneTex);
    rt.depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rt.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rt.depthRb);
    rt.ms = null;
    if (this.samples > 0) {
      try {
        const ms = {};
        ms.colorRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, ms.colorRb);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, ifmt, w, h);
        ms.depthRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, ms.depthRb);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, w, h);
        ms.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fbo);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, ms.colorRb);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ms.depthRb);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) rt.ms = ms;
      } catch (e) { rt.ms = null; }
    }
    // bloom chain
    const bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1), cw = Math.max(2, w >> 2), ch = Math.max(2, h >> 2);
    rt.bA = this.tex2D(bw, bh, gl.RGBA, ifmt, half, gl.LINEAR); rt.fA = this.fboFor(rt.bA);
    rt.bB = this.tex2D(bw, bh, gl.RGBA, ifmt, half, gl.LINEAR); rt.fB = this.fboFor(rt.bB);
    rt.bC = this.tex2D(cw, ch, gl.RGBA, ifmt, half, gl.LINEAR); rt.fC = this.fboFor(rt.bC);
    rt.bD = this.tex2D(cw, ch, gl.RGBA, ifmt, half, gl.LINEAR); rt.fD = this.fboFor(rt.bD);
    rt.bw = bw; rt.bh = bh; rt.cw = cw; rt.ch = ch;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.rt = rt;
  }
  mesh(mb, dynamic) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.v), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mb.i), gl.STATIC_DRAW);
    const S = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 32);
    gl.bindVertexArray(null);
    return { vao, count: mb.i.length };
  }
  drawMesh(m) {
    const gl = this.gl;
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
  }
  // upload a canvas / ImageData-like source to a mipmapped texture
  texFromCanvas(cv, linearSpace) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  fullscreen() { const gl = this.gl; gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  // run bloom + composite from the resolved scene texture
  post(p) {
    const gl = this.gl, rt = this.rt;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fA); gl.viewport(0, 0, rt.bw, rt.bh);
    this.bright.use(); this.bright.i('uTex', 0); this.bright.f('uThr', p.thr || 0.85);
    gl.bindTexture(gl.TEXTURE_2D, rt.sceneTex); this.fullscreen();
    this.blur.use(); this.blur.i('uTex', 0);
    const pass = (src, dst, w, h, dx, dy) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst); gl.viewport(0, 0, w, h);
      this.blur.v2('uDir', dx / w, dy / h);
      gl.bindTexture(gl.TEXTURE_2D, src); this.fullscreen();
    };
    pass(rt.bA, rt.fB, rt.bw, rt.bh, 1.2, 0); pass(rt.bB, rt.fA, rt.bw, rt.bh, 0, 1.2);
    // downsample into quarter (bilinear via blur pass sampling)
    pass(rt.bA, rt.fC, rt.cw, rt.ch, 1.6, 0); pass(rt.bC, rt.fD, rt.cw, rt.ch, 0, 1.6);
    pass(rt.bD, rt.fC, rt.cw, rt.ch, 2.4, 0); pass(rt.bC, rt.fD, rt.cw, rt.ch, 0, 2.4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h);
    const c = this.comp.use();
    c.i('uScene', 0); c.i('uB1', 1); c.i('uB2', 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rt.sceneTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rt.bA);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rt.bD);
    c.f('uTime', p.time); c.f('uFear', p.fear); c.f('uHit', p.hit); c.f('uPulse', p.pulse); c.f('uGlitch', p.glitch);
    c.f('uFade', p.fade); c.f('uExp', p.exp); c.f('uAspect', this.w / this.h); c.f('uBloom', p.bloom); c.f('uWhite', p.white || 0);
    this.fullscreen();
    gl.activeTexture(gl.TEXTURE0);
  }
}

/* ============ procedural textures (diffuse + normal) ============ */
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function genTex(R, W, H, fn, str) {
  const cv = cvs(W, H), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  const hg = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = fn(x / W, y / H), i = (y * W + x) * 4;
    img.data[i] = clamp(o[0], 0, 1) * 255; img.data[i + 1] = clamp(o[1], 0, 1) * 255; img.data[i + 2] = clamp(o[2], 0, 1) * 255; img.data[i + 3] = 255;
    hg[y * W + x] = o[3];
  }
  ctx.putImageData(img, 0, 0);
  const nc = cvs(W, H), nx = nc.getContext('2d'), ni = nx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xl = (x + W - 1) % W, xr = (x + 1) % W, yu = (y + H - 1) % H, yd = (y + 1) % H;
    const dx = (hg[y * W + xr] - hg[y * W + xl]) * str, dy = (hg[yd * W + x] - hg[yu * W + x]) * str;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    ni.data[i] = (-dx / l * 0.5 + 0.5) * 255; ni.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
  }
  nx.putImageData(ni, 0, 0);
  return { diff: R.texFromCanvas(cv), norm: R.texFromCanvas(nc) };
}
function solidTex(R, r, g, b) {
  const c = cvs(1, 1), x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 1, 1);
  return R.texFromCanvas(c);
}
const tick = () => new Promise(r => setTimeout(r, 0));

async function buildMaterials(R, progress) {
  const M = {};
  const flat = solidTex(R, 128, 128, 255), white = solidTex(R, 255, 255, 255);
  const mat = (t, spec, shin, ns, dirt) => ({ diff: t.diff || t, norm: t.norm || flat, spec: [spec, shin], ns: ns, dirt: dirt, emis: [0, 0, 0] });

  // wooden floor
  progress(0.05); await tick();
  M.wood = mat(genTex(R, 512, 512, (u, v) => {
    const pw = 6, pi = Math.floor(u * pw), pu = u * pw - pi;
    const off = hash2(pi, 7, 3), vv = (v + off) % 1, seg = Math.floor(vv * 2), fy = vv * 2 - seg;
    const tint = hash2(pi, seg, 5);
    const grain = fbm(u * 18, v * 44, 11 + pi, 18, 44, 3);
    const rings = 0.5 + 0.5 * Math.sin((pu * 9 + grain * 6) * PI);
    const wear = fbm(u * 3, v * 3, 91, 3, 3, 4);
    const e = Math.min(pu, 1 - pu);
    let k = (0.55 + 0.7 * tint) * (0.55 + 0.5 * grain + 0.18 * rings) * (0.6 + 0.6 * wear);
    let h = 0.5 + 0.25 * grain + 0.1 * rings;
    if (e < 0.035 || fy < 0.012 || fy > 0.99) { k *= 0.12; h = 0; }
    else if (e < 0.06) { h *= 0.8; }
    return [0.34 * k, 0.2 * k, 0.1 * k, h];
  }, 3.0), 0.5, 36, 1.0, 0.9);

  // checker tile
  progress(0.15); await tick();
  M.tile = mat(genTex(R, 512, 512, (u, v) => {
    const ix = Math.floor(u * 4), iy = Math.floor(v * 4), tx = u * 4 - ix, ty = v * 4 - iy;
    const e = Math.min(tx, 1 - tx, ty, 1 - ty);
    const chk = (ix + iy) & 1, n = fbm(u * 10, v * 10, 5, 10, 10, 4), n2 = fbm(u * 3, v * 3, 8, 3, 3, 3);
    let c = chk ? [0.045, 0.045, 0.05] : [0.6, 0.58, 0.52];
    let k = 0.55 + 0.7 * n, h = 0.8 - 0.1 * n;
    if (e < 0.03) { c = [0.16, 0.15, 0.12]; k = 0.8; h = 0; }
    else if (e < 0.05) h = 0.55 + (e - 0.03) * 12;
    const cr = Math.abs(fbm(u * 14, v * 14, 33, 14, 14, 3) - 0.5);
    if (cr < 0.008) { k *= 0.3; h -= 0.3; }
    const stain = smooth(0.6, 0.8, n2);
    return [c[0] * k * (1 - stain * 0.5) + stain * 0.05, c[1] * k * (1 - stain * 0.65), c[2] * k * (1 - stain * 0.7), h];
  }, 4.0), 0.9, 110, 1.0, 1.0);

  // carpet
  progress(0.25); await tick();
  M.carpet = mat(genTex(R, 256, 256, (u, v) => {
    const a = Math.abs((u * 4) % 1 - 0.5) + Math.abs((v * 4) % 1 - 0.5);
    const fib = fbm(u * 96, v * 96, 21, 96, 96, 2);
    let c = [0.3, 0.035, 0.05];
    if (Math.abs(a - 0.36) < 0.025) c = [0.5, 0.34, 0.1];
    else if (a < 0.16) c = [0.2, 0.025, 0.04];
    else if (Math.abs(a - 0.22) < 0.012) c = [0.38, 0.27, 0.1];
    const k = 0.55 + 0.7 * fib;
    return [c[0] * k, c[1] * k, c[2] * k, fib];
  }, 2.2), 0.04, 6, 1.0, 1.0);

  // stone flags
  progress(0.35); await tick();
  M.stone = mat(genTex(R, 512, 512, (u, v) => {
    const iy = Math.floor(v * 4), ty = v * 4 - iy;
    const su = u * 3 + (iy & 1) * 0.5, ix = Math.floor(su), tx = su - ix;
    const e = Math.min(tx, 1 - tx, ty, 1 - ty);
    const bt = hash2(ix, iy, 9), n = fbm(u * 9, v * 9, 3, 9, 9, 4), n2 = fbm(u * 28, v * 28, 4, 28, 28, 2);
    let k = (0.35 + 0.35 * bt) * (0.6 + 0.8 * n), h = 0.6 + 0.3 * n + 0.1 * n2;
    if (e < 0.04) { k *= 0.25; h = 0.1; }
    return [k * 0.9, k * 0.92, k, h];
  }, 4.5), 0.35, 30, 1.0, 1.0);

  // dirty white peeling paint on gray cement + original wood frame bottom 1/4 + little blood
  progress(0.5); await tick();
  M.wall = mat(genTex(R, 512, 512, (u, v) => {
    // bottom ~42%: square wood panels with geometric carvings
    if (v > 0.58) {
      const local = (v - 0.58) / 0.42;
      const panelsU = 2.2, panelsV = 3.5;
      const pu = (u * panelsU) % 1;
      const pv = (local * panelsV) % 1;
      const e = Math.min(pu, 1 - pu, pv, 1 - pv);
      const n = fbm(u * 9, v * 9, 5, 9, 9, 3);
      const gr = fbm(u * 14, v * 50, 12, 14, 50, 3);
      let k = 0.5 + 0.7 * gr;
      let h = 0.75;
      let m = 1;
      // panel borders (raised)
      if (e < 0.06) { h = 0.92; m = 1.1; }
      else if (e < 0.1) { h = 0.6; m = 0.85; }
      // geometric carvings inside panels
      const cu = pu - 0.5, cv = pv - 0.5;
      const diamond = Math.abs(cu) + Math.abs(cv);
      const circle = Math.hypot(cu, cv);
      const lines = Math.abs(Math.sin(cu * 8 * PI)) < 0.12 || Math.abs(Math.sin(cv * 6 * PI)) < 0.1;
      if (e > 0.12) {
        if (diamond < 0.28 && diamond > 0.18) { h = 0.45; k *= 0.7; } // diamond frame
        else if (circle < 0.12) { h = 0.5; k *= 0.75; } // center circle
        else if (lines) { h = 0.55; k *= 0.8; }
      }
      if (local < 0.03) return [0.4, 0.28, 0.17, 0.95];
      return [0.26 * k * m * (0.65 + 0.45 * n), 0.15 * k * m * (0.65 + 0.45 * n), 0.08 * k * m * (0.65 + 0.45 * n), h];
    }

    // upper: dirty mottled white/gray paint on cement, fine peeling, heavy dirt, real streaking
    const cementN = fbm(u * 12, v * 12, 4, 12, 12, 4);
    let cr = 0.38 + 0.08 * cementN;
    let cg = 0.36 + 0.07 * cementN;
    let cb = 0.34 + 0.06 * cementN;
    let ch = 0.46 + 0.12 * cementN;

    // base dirty white-gray paint with real mottling
    const mott1 = fbm(u * 8, v * 9, 11, 8, 9, 3);
    const mott2 = fbm(u * 22, v * 25, 19, 22, 25, 2);
    const streak = fbm(u * 1.8, v * 6.5, 27, 2, 6, 3); // vertical-ish streaking
    let pr = 0.68 * (0.7 + 0.4 * mott1) * (0.9 + 0.15 * mott2);
    let pg = 0.66 * (0.7 + 0.4 * mott1) * (0.9 + 0.15 * mott2);
    let pb = 0.62 * (0.7 + 0.4 * mott1) * (0.9 + 0.15 * mott2);
    pr *= 0.75 + 0.3 * streak;
    pg *= 0.73 + 0.3 * streak;
    pb *= 0.7 + 0.3 * streak;

    // heavy layered dirt: dark grime + light dust
    const darkDirt = smooth(0.35, 0.7, fbm(u * 7, v * 8, 41, 7, 8, 4));
    const lightDirt = fbm(u * 18, v * 20, 53, 18, 20, 2);
    const soot = smooth(0.5, 0.8, fbm(u * 4.5, v * 5, 67, 4, 5, 3));
    pr *= 1 - darkDirt * 0.55 - soot * 0.4;
    pg *= 1 - darkDirt * 0.58 - soot * 0.42;
    pb *= 1 - darkDirt * 0.62 - soot * 0.45;
    pr += lightDirt * 0.08;
    pg += lightDirt * 0.07;
    pb += lightDirt * 0.06;

    // fine peeling (higher frequency so no big blobs)
    const peelN = fbm(u * 9, v * 10, 31, 9, 10, 4);
    const peelDetail = fbm(u * 28, v * 32, 47, 28, 32, 2);
    let peel = smooth(0.48, 0.72, peelN) * (0.5 + 0.5 * peelDetail);
    peel = Math.min(0.85, peel + smooth(0.65, 0.92, v) * 0.25);
    const edge = smooth(0.08, 0.18, Math.abs(peelN - 0.55) * 1.8);

    let r = pr * (1 - peel) + cr * peel;
    let g = pg * (1 - peel) + cg * peel;
    let b = pb * (1 - peel) + cb * peel;
    let h = 0.5 * (1 - peel) + ch * peel;
    if (edge > 0.3 && peel > 0.1 && peel < 0.75) {
      h = Math.max(h, 0.68);
    }

    // little sparse blood
    const bloodN = fbm(u * 14, v * 16, 71, 14, 16, 2);
    const bloodAmt = smooth(0.7, 0.88, bloodN) * 0.22;
    if (bloodAmt > 0.04) {
      r = r * (1 - bloodAmt) + 0.38 * bloodAmt;
      g = g * (1 - bloodAmt) + 0.045 * bloodAmt;
      b = b * (1 - bloodAmt) + 0.035 * bloodAmt;
    }

    return [clamp(r, 0.05, 0.85), clamp(g, 0.05, 0.8), clamp(b, 0.04, 0.75), h];
  }, 3.4), 0.22, 20, 1.0, 0.9);

  // ceiling plaster
  progress(0.65); await tick();
  M.ceil = mat(genTex(R, 256, 256, (u, v) => {
    const n = fbm(u * 6, v * 6, 2, 6, 6, 4), cr = Math.abs(fbm(u * 9, v * 9, 44, 9, 9, 3) - 0.5);
    let k = 0.5 + 0.5 * n;
    const stain = smooth(0.55, 0.75, fbm(u * 3, v * 3, 12, 3, 3, 3));
    k *= 1 - stain * 0.45;
    let h = 0.5 + 0.2 * n;
    if (cr < 0.007) { k *= 0.3; h -= 0.3; }
    return [0.5 * k, 0.49 * k, 0.45 * k * (1 - stain * 0.25), h];
  }, 2.5), 0.05, 8, 1.0, 1.0);

  // original furniture wood (restored)
  progress(0.75); await tick();
  M.furn = mat(genTex(R, 256, 256, (u, v) => {
    const gr = fbm(u * 6, v * 50, 15, 6, 50, 3), rg = 0.5 + 0.5 * Math.sin((u * 8 + gr * 5) * PI);
    const k = 0.45 + 0.6 * gr + 0.25 * rg;
    return [0.3 * k, 0.15 * k, 0.08 * k, 0.5 + 0.3 * gr];
  }, 2.5), 0.55, 44, 1.0, 0.5);

  // separate material for wall lower wood panels only
  M.wpanel = mat(genTex(R, 256, 256, (u, v) => {
    const panelsU = 2.2, panelsV = 3.2;
    const pu = (u * panelsU) % 1, pv = (v * panelsV) % 1;
    const e = Math.min(pu, 1 - pu, pv, 1 - pv);
    const n = fbm(u * 8, v * 8, 4, 8, 8, 3);
    const gr = fbm(u * 12, v * 40, 11, 12, 40, 3);
    let k = 0.5 + 0.65 * gr;
    let h = 0.72;
    let m = 1;
    if (e < 0.055) { h = 0.94; m = 1.15; }
    else if (e < 0.09) { h = 0.58; m = 0.9; }
    const cu = pu - 0.5, cv = pv - 0.5;
    const diamond = Math.abs(cu) + Math.abs(cv);
    if (e > 0.11 && diamond < 0.26 && diamond > 0.16) { h = 0.42; k *= 0.65; }
    else if (e > 0.11 && Math.hypot(cu, cv) < 0.1) { h = 0.48; k *= 0.7; }
    return [0.24 * k * m * (0.65 + 0.4 * n), 0.13 * k * m * (0.65 + 0.4 * n), 0.07 * k * m * (0.65 + 0.4 * n), h];
  }, 3.0), 0.4, 36, 1.0, 0.6);

  M.white = mat({ diff: white, norm: flat }, 0.25, 30, 0.0, 0.0);
  M.fabric = mat({ diff: white, norm: flat }, 0.04, 6, 0.0, 0.6);
  M.skin = mat({ diff: white, norm: flat }, 0.5, 60, 0.0, 0.0);
  M.glow = mat({ diff: white, norm: flat }, 0.0, 8, 0.0, 0.0);

  // paper (collectible notes)
  progress(0.85); await tick();
  {
    const c = cvs(256, 256), x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 20, 128, 128, 190);
    g.addColorStop(0, '#d8cdae'); g.addColorStop(1, '#8e7e5a');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const r = rng(77);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,60,25,${r() * 0.12})`; x.beginPath(); x.arc(r() * 256, r() * 256, 6 + r() * 26, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(40,24,14,.85)'; x.lineWidth = 2; x.lineCap = 'round';
    for (let l = 0; l < 11; l++) {
      x.beginPath(); let px = 22, py = 30 + l * 19;
      x.moveTo(px, py);
      while (px < 232 - r() * 40) { px += 5 + r() * 9; x.lineTo(px, py + (r() - 0.5) * 7); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(140,10,14,.9)'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(40, 90); x.bezierCurveTo(90, 60, 150, 190, 215, 160); x.stroke();
    x.fillStyle = 'rgba(120,8,10,.7)'; x.beginPath(); x.arc(205, 200, 14, 0, TAU); x.fill();
    M.paper = mat({ diff: R.texFromCanvas(c), norm: flat }, 0.05, 6, 0.0, 0.0);
  }

  // portraits atlas 2x2
  {
    const c = cvs(512, 512), x = c.getContext('2d'), r = rng(5);
    for (let k = 0; k < 4; k++) {
      const ox = (k % 2) * 256, oy = (k >> 1) * 256;
      const bg = x.createLinearGradient(ox, oy, ox, oy + 256); bg.addColorStop(0, '#2a1f14'); bg.addColorStop(1, '#0d0906');
      x.fillStyle = bg; x.fillRect(ox, oy, 256, 256);
      x.fillStyle = '#0c0a0c'; x.beginPath(); x.ellipse(ox + 128, oy + 262, 100, 78, 0, 0, TAU); x.fill();
      x.fillStyle = '#b9a58e'; x.fillRect(ox + 113, oy + 150, 30, 40);
      const hair = ['#0a0707', '#2a1a0c', '#101010', '#050505'][k];
      if (k === 0 || k === 3) { x.fillStyle = hair; x.beginPath(); x.ellipse(ox + 128, oy + 120, 62, 82, 0, 0, TAU); x.fill(); x.fillRect(ox + 64, oy + 120, 128, 126); }
      const fg = x.createRadialGradient(ox + 120, oy + 105, 10, ox + 128, oy + 120, 58); fg.addColorStop(0, '#d6c2a8'); fg.addColorStop(1, '#8c7660');
      x.fillStyle = fg; x.beginPath(); x.ellipse(ox + 128, oy + 120, k === 1 ? 40 : 46, k === 1 ? 50 : 60, 0, 0, TAU); x.fill();
      if (k === 2) { x.fillStyle = '#0a0a0a'; x.fillRect(ox + 70, oy + 62, 116, 14); x.fillRect(ox + 92, oy + 30, 72, 40); }
      if (k === 1) { x.fillStyle = hair; x.beginPath(); x.ellipse(ox + 128, oy + 84, 44, 24, 0, PI, TAU); x.fill(); }
      if (k !== 3) {
        x.fillStyle = '#050304';
        x.beginPath(); x.ellipse(ox + 110, oy + 112, 9, 12, 0, 0, TAU); x.fill();
        x.beginPath(); x.ellipse(ox + 146, oy + 112, 9, 12, 0, 0, TAU); x.fill();
        x.fillStyle = '#e8e2d0'; x.fillRect(ox + 108, oy + 108, 3, 3); x.fillRect(ox + 144, oy + 108, 3, 3);
        x.strokeStyle = '#3a1a18'; x.lineWidth = 2; x.beginPath(); x.moveTo(ox + 114, oy + 152); x.lineTo(ox + 142, oy + 153); x.stroke();
      } else {
        x.fillStyle = '#1c0e0e'; for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(ox + 100 + r() * 56, oy + 90 + r() * 60, 3 + r() * 10, 6 + r() * 16, r() * 3, 0, TAU); x.fill(); }
      }
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1;
      for (let i = 0; i < 40; i++) { x.beginPath(); let px = ox + r() * 256, py = oy + r() * 256; x.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
      const vg = x.createRadialGradient(ox + 128, oy + 128, 60, ox + 128, oy + 128, 190); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.7)');
      x.fillStyle = vg; x.fillRect(ox, oy, 256, 256);
    }
    M.paint = mat({ diff: R.texFromCanvas(c), norm: flat }, 0.35, 40, 0.0, 0.0);
  }

  // night forest window (realistic view)
  {
    const c = cvs(512, 512), x = c.getContext('2d');
    // sky
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#0a1228'); g.addColorStop(0.6, '#1a2a48'); g.addColorStop(1, '#0d1a30');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    // moon
    const mg = x.createRadialGradient(380, 90, 8, 380, 90, 80);
    mg.addColorStop(0, 'rgba(220,230,255,0.9)'); mg.addColorStop(0.3, 'rgba(140,170,220,0.4)'); mg.addColorStop(1, 'rgba(40,60,100,0)');
    x.fillStyle = mg; x.fillRect(0, 0, 512, 512);
    // distant trees / forest silhouette
    x.fillStyle = '#05080e';
    for (let i = 0; i < 28; i++) {
      const tx = i * 20 + (i % 3) * 8;
      const th = 180 + Math.sin(i * 1.7) * 60;
      x.beginPath();
      x.moveTo(tx, 512);
      x.lineTo(tx + 12, 512 - th);
      x.lineTo(tx + 24, 512);
      x.fill();
    }
    // closer trees
    for (let i = 0; i < 14; i++) {
      const tx = 20 + i * 36;
      const th = 260 + Math.sin(i * 2.3) * 40;
      x.beginPath();
      x.moveTo(tx, 512);
      x.lineTo(tx + 18, 512 - th);
      x.lineTo(tx + 36, 512);
      x.fill();
    }
    // window frame (dark wood)
    x.fillStyle = '#1a120c';
    x.fillRect(0, 0, 512, 18); x.fillRect(0, 494, 512, 18);
    x.fillRect(0, 0, 18, 512); x.fillRect(494, 0, 18, 512);
    x.fillRect(246, 0, 20, 512); // middle mullion
    // one pane slightly open look (lighter / offset suggestion via gradient)
    const openG = x.createLinearGradient(260, 0, 512, 0);
    openG.addColorStop(0, 'rgba(255,255,255,0.03)');
    openG.addColorStop(1, 'rgba(180,200,255,0.08)');
    x.fillStyle = openG; x.fillRect(266, 18, 228, 476);
    // lighter glass so 3D forest shows through
    x.fillStyle = 'rgba(160,190,230,0.12)'; x.fillRect(18, 18, 476, 476);
    M.window = mat({ diff: R.texFromCanvas(c), norm: flat }, 0.4, 40, 0.0, 0.0);
  }

  // ---- outdoor materials ----
  progress(0.9); await tick();
  M.brick = mat(genTex(R, 256, 256, (u, v) => {
    const rows = 14, cols = 6;
    const ry = Math.floor(v * rows), ty = v * rows - ry;
    const su = u * cols + (ry & 1) * 0.5, ix = Math.floor(su), tx = su - ix;
    const e = Math.min(tx, 1 - tx, ty, 1 - ty);
    const bt = hash2(ix, ry, 13), n = fbm(u * 10, v * 10, 6, 10, 10, 3);
    let k = (0.6 + 0.5 * bt) * (0.6 + 0.7 * n), h = 0.7 + 0.2 * n;
    if (e < 0.07) { k *= 0.35; h = 0.1; }
    return [0.55 * k, 0.27 * k, 0.2 * k, h];
  }, 4.0), 0.15, 16, 1.0, 1.0);
  progress(0.93); await tick();
  M.grass = mat(genTex(R, 256, 256, (u, v) => {
    const n = fbm(u * 16, v * 16, 61, 16, 16, 4), n2 = fbm(u * 64, v * 64, 62, 64, 64, 2), k = 0.5 + 0.6 * n + 0.3 * n2;
    return [0.12 * k, 0.27 * k, 0.08 * k, 0.4 + 0.5 * n2];
  }, 3.0), 0.05, 8, 1.0, 0.7);
  progress(0.96); await tick();
  M.road = mat(genTex(R, 256, 256, (u, v) => {
    const n = fbm(u * 24, v * 24, 71, 24, 24, 3), n2 = fbm(u * 90, v * 90, 72, 90, 90, 1), k = 0.55 + 0.5 * n + 0.35 * n2;
    const cr = Math.abs(fbm(u * 6, v * 6, 73, 6, 6, 3) - 0.5);
    const kk = cr < 0.01 ? k * 0.3 : k;
    return [0.17 * kk, 0.17 * kk, 0.18 * kk, 0.4 + 0.4 * n2];
  }, 3.0), 0.25, 26, 1.0, 0.8);
  M.iron = mat({ diff: white, norm: flat }, 0.7, 70, 0.0, 0.8);
  M.glass = mat({ diff: white, norm: flat }, 0.9, 90, 0.0, 0.2);
  M.litwin = M.glow;
  progress(1);
  return M;
}

/* ============ WORLD: map, shell geometry, prop helpers ============ */
const CS = 2, WH = 3.4, MW = 42, MH = 32;
// outdoor layout (metres). House box is x 0..84, z 0..64; south (+z) is the street side.
const FX0 = -14, FX1 = 98, FZ0 = -14, FZ1 = 104, GATE0 = 38, GATE1 = 46;
const BX0 = -130, BX1 = 280, BZ0 = -120, BZ1 = 420;
const SQ = [42, 320];
const ROOMS = [
  { id: 0, name: 'الردهة', x0: 16, y0: 22, x1: 25, y1: 29, floor: 'wood', tint: [0.95, 0.8, 0.62], ft: [1, 0.9, 0.8] },
  { id: 1, name: 'القاعة الكبرى', x0: 16, y0: 12, x1: 25, y1: 20, floor: 'tile', tint: [0.7, 0.8, 0.88], ft: [1, 1, 1] },
  { id: 2, name: 'غرفة الجلوس', x0: 4, y0: 13, x1: 12, y1: 20, floor: 'carpet', tint: [0.55, 0.78, 0.62], ft: [1, 1, 1] },
  { id: 3, name: 'المكتبة', x0: 29, y0: 13, x1: 38, y1: 20, floor: 'wood', tint: [0.85, 0.55, 0.38], ft: [0.8, 0.7, 0.6] },
  { id: 4, name: 'المطبخ', x0: 4, y0: 3, x1: 12, y1: 10, floor: 'tile', tint: [0.78, 0.86, 0.8], ft: [0.9, 1, 0.95] },
  { id: 5, name: 'غرفة الطعام', x0: 16, y0: 3, x1: 25, y1: 10, floor: 'wood', tint: [0.8, 0.4, 0.42], ft: [1, 0.85, 0.75] },
  { id: 6, name: 'غرفة النوم', x0: 29, y0: 3, x1: 38, y1: 10, floor: 'carpet', tint: [0.58, 0.6, 0.85], ft: [0.8, 0.85, 1] },
  { id: 7, name: 'المخزن', x0: 4, y0: 22, x1: 12, y1: 29, floor: 'stone', tint: [0.72, 0.72, 0.7], ft: [1, 1, 1] },
  { id: 8, name: 'المصلّى القديم', x0: 29, y0: 22, x1: 38, y1: 29, floor: 'stone', tint: [0.55, 0.66, 0.9], ft: [0.8, 0.9, 1] }
];
const LINKS = [
  { x0: 20, y0: 21, x1: 21, y1: 21 },
  { x0: 13, y0: 16, x1: 15, y1: 16, axis: 'x', door: [14, 16] },
  { x0: 26, y0: 16, x1: 28, y1: 16, axis: 'x', door: [27, 16], locked: true },
  { x0: 20, y0: 11, x1: 20, y1: 11, axis: 'y', door: [20, 11] },
  { x0: 8, y0: 11, x1: 8, y1: 12, axis: 'y', door: [8, 11] },
  { x0: 33, y0: 11, x1: 33, y1: 12, axis: 'y', door: [33, 12] },
  { x0: 8, y0: 21, x1: 8, y1: 21, axis: 'y', door: [8, 21] },
  { x0: 33, y0: 21, x1: 33, y1: 21, axis: 'y', door: [33, 21] },
  { x0: 13, y0: 26, x1: 15, y1: 26, axis: 'x', door: [14, 26] },
  { x0: 26, y0: 26, x1: 28, y1: 26, axis: 'x', door: [27, 26] },
  { x0: 13, y0: 6, x1: 15, y1: 6, axis: 'x', door: [14, 6] },
  { x0: 26, y0: 6, x1: 28, y1: 6, axis: 'x', door: [27, 6] },
  { x0: 20, y0: 30, x1: 21, y1: 31, axis: 'y', exitDoor: [[20, 30], [21, 30]] }
];
const PILLARS = [[18, 14], [23, 14], [18, 18], [23, 18]];
const cellIdx = (i, j) => j * MW + i;

class WorldBuilder {
  constructor(MAT) {
    this.MAT = MAT; this.B = {}; this.cols = []; this.lights = []; this.emit = [];
    this.pages = []; this.keyItem = null; this.hides = []; this.rand = rng(20261023);
    this.items = [];
    this.solid = new Uint8Array(MW * MH).fill(1);
    this.roomOf = new Int16Array(MW * MH).fill(-2);
    this.doors = []; this.doorAt = new Int16Array(MW * MH).fill(-1);
    this.clocks = [];
    this.carve();
  }
  b(k) { return this.B[k] || (this.B[k] = new MB()); }
  carve() {
    for (const r of ROOMS) for (let j = r.y0; j <= r.y1; j++) for (let i = r.x0; i <= r.x1; i++) { this.solid[cellIdx(i, j)] = 0; this.roomOf[cellIdx(i, j)] = r.id; }
    for (const l of LINKS) for (let j = l.y0; j <= l.y1; j++) for (let i = l.x0; i <= l.x1; i++) { this.solid[cellIdx(i, j)] = 0; this.roomOf[cellIdx(i, j)] = -1; }
    for (const p of PILLARS) this.solid[cellIdx(p[0], p[1])] = 1;
    for (const l of LINKS) {
      if (l.door) this.addDoor(l.door[0], l.door[1], l.axis, !!l.locked, false);
      if (l.exitDoor) l.exitDoor.forEach((c, k) => this.addDoor(c[0], c[1], 'y', false, true, k === 0 ? 1 : -1));
    }
  }
  addDoor(cx, cy, axis, locked, exit, side) {
    const d = { cx, cy, axis, locked, exit: !!exit, open: 0, target: 0, side: side || 1, id: this.doors.length };
    this.doors.push(d); this.doorAt[cellIdx(cx, cy)] = d.id;
  }
  cellTint(i, j) {
    const r = this.roomOf[cellIdx(i, j)];
    if (r >= 0) return ROOMS[r].tint;
    return [0.5, 0.42, 0.36];
  }
  /* ---- shell: walls, floors, ceilings, door frames ---- */
  buildShell() {
    const W = this.b('wall'), C = this.b('ceil');
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const id = cellIdx(i, j);
      if (this.solid[id]) {
        for (const d of dirs) {
          const ni = i + d[0], nj = j + d[1];
          if (ni < 0 || nj < 0 || ni >= MW || nj >= MH) {
            // exterior brick face of the house
            let pe, ue;
            if (d[0] !== 0) {
              const x = d[0] > 0 ? (i + 1) * CS : i * CS, z0 = j * CS, z1 = (j + 1) * CS;
              pe = [[x, -0.3, z0], [x, -0.3, z1], [x, WH, z1], [x, WH, z0]]; ue = [z0 / 2, z1 / 2];
            } else {
              const z = d[1] > 0 ? (j + 1) * CS : j * CS, x0 = i * CS, x1 = (i + 1) * CS;
              pe = [[x0, -0.3, z], [x1, -0.3, z], [x1, WH, z], [x0, WH, z]]; ue = [x0 / 2, x1 / 2];
            }
            this.b('brick').quad(pe, [d[0], 0, d[1]], [0.8, 0.72, 0.68], [[ue[0], 1], [ue[1], 1], [ue[1], 0], [ue[0], 0]]);
            continue;
          }
          if (this.solid[cellIdx(ni, nj)]) continue;
          const tint = this.cellTint(ni, nj);
          let p, uu;
          if (d[0] !== 0) {
            const x = d[0] > 0 ? (i + 1) * CS : i * CS, z0 = j * CS, z1 = (j + 1) * CS;
            p = [[x, 0, z0], [x, 0, z1], [x, WH, z1], [x, WH, z0]]; uu = [z0 / 2, z1 / 2];
          } else {
            const z = d[1] > 0 ? (j + 1) * CS : j * CS, x0 = i * CS, x1 = (i + 1) * CS;
            p = [[x0, 0, z], [x1, 0, z], [x1, WH, z], [x0, WH, z]]; uu = [x0 / 2, x1 / 2];
          }
          W.quad(p, [d[0], 0, d[1]], tint, [[uu[0], 1], [uu[1], 1], [uu[1], 0], [uu[0], 0]]);
          // protruding lower wood panel (about 40% height, sticks out 4cm)
          const woodH = WH * 0.42;
          const stick = 0.04;
          if (d[0] !== 0) {
            const x = d[0] > 0 ? (i + 1) * CS + d[0] * stick * 0.5 : i * CS + d[0] * stick * 0.5;
            const z0 = j * CS, z1 = (j + 1) * CS;
            const pp = [[x, 0, z0], [x, 0, z1], [x, woodH, z1], [x, woodH, z0]];
            this.b('wpanel').quad(pp, [d[0], 0, d[1]], [0.85, 0.7, 0.55], [[z0 / 2, 1], [z1 / 2, 1], [z1 / 2, 0], [z0 / 2, 0]]);
          } else {
            const z = d[1] > 0 ? (j + 1) * CS + d[1] * stick * 0.5 : j * CS + d[1] * stick * 0.5;
            const x0 = i * CS, x1 = (i + 1) * CS;
            const pp = [[x0, 0, z], [x1, 0, z], [x1, woodH, z], [x0, woodH, z]];
            this.b('wpanel').quad(pp, [d[0], 0, d[1]], [0.85, 0.7, 0.55], [[x0 / 2, 1], [x1 / 2, 1], [x1 / 2, 0], [x0 / 2, 0]]);
          }
        }
      } else {
        const r = this.roomOf[id], room = r >= 0 ? ROOMS[r] : null;
        const fk = room ? room.floor : 'stone', ft = room ? room.ft : [0.55, 0.5, 0.45];
        const x0 = i * CS, x1 = x0 + CS, z0 = j * CS, z1 = z0 + CS;
        this.b(fk).quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0], ft, [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]]);
        C.quad([[x0, WH, z0], [x1, WH, z0], [x1, WH, z1], [x0, WH, z1]], [0, -1, 0], [1, 1, 1], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]]);
      }
    }
    // flat roof over the whole house
    this.b('stone').quad([[0, WH, 0], [MW * CS, WH, 0], [MW * CS, WH, MH * CS], [0, WH, MH * CS]], [0, 1, 0], [0.2, 0.19, 0.2], [[0, 0], [MW, 0], [MW, MH], [0, MH]]);
    // pillar capitals / bases and door frames
    for (const p of PILLARS) {
      const cx = p[0] * CS + 1, cz = p[1] * CS + 1;
      this.b('furn').box(cx, 0.12, cz, 2.2, 0.24, 2.2, [0.8, 0.8, 0.8], 0, 0.5);
      this.b('furn').box(cx, WH - 0.12, cz, 2.2, 0.24, 2.2, [0.8, 0.8, 0.8], 0, 0.5);
    }
    for (const d of this.doors) {
      const cx = d.cx * CS + 1, cz = d.cy * CS + 1, F = this.b('furn');
      F.box(cx, 2.7 + 0.35, cz, 2, 0.7, 2, [0.6, 0.45, 0.35], 0, 0.5);
      if (d.axis === 'y') { F.box(cx - 0.95, 1.35, cz, 0.12, 2.7, 0.4, [0.55, 0.4, 0.3], 0, 0.5); F.box(cx + 0.95, 1.35, cz, 0.12, 2.7, 0.4, [0.55, 0.4, 0.3], 0, 0.5); }
      else { F.box(cx, 1.35, cz - 0.95, 0.4, 2.7, 0.12, [0.55, 0.4, 0.3], 0, 0.5); F.box(cx, 1.35, cz + 0.95, 0.4, 2.7, 0.12, [0.55, 0.4, 0.3], 0, 0.5); }
    }
    // baseboards-like skirting is baked into the wall texture
  }
  /* ---- prop helpers (all axis aligned) ---- */
  col(x0, z0, x1, z1) { this.cols.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  fb(mat, cx, cy, cz, sx, sy, sz, c, collide, uv) {
    this.b(mat).box(cx, cy, cz, sx, sy, sz, c || [1, 1, 1], 0, uv || 0.55);
    if (collide) this.col(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
  }
  table(cx, cz, w, d, h, c) {
    c = c || [1, 0.85, 0.7];
    this.b('furn').box(cx, h - 0.04, cz, w, 0.08, d, c, 0, 0.55);
    const lx = w / 2 - 0.1, lz = d / 2 - 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b('furn').box(cx + sx * lx, (h - 0.08) / 2, cz + sz * lz, 0.09, h - 0.08, 0.09, c, 0, 0.55);
    this.col(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
    return h;
  }
  chair(cx, cz, fx, fz, c) {
    c = c || [0.9, 0.7, 0.55];
    const F = this.b('furn');
    F.box(cx, 0.45, cz, 0.46, 0.06, 0.46, c, 0, 0.55);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(cx + sx * 0.19, 0.21, cz + sz * 0.19, 0.05, 0.42, 0.05, c, 0, 0.55);
    if (fx !== 0) F.box(cx - fx * 0.21, 0.78, cz, 0.05, 0.6, 0.46, c, 0, 0.55); else F.box(cx, 0.78, cz - fz * 0.21, 0.46, 0.6, 0.05, c, 0, 0.55);
    this.col(cx - 0.23, cz - 0.23, cx + 0.23, cz + 0.23);
  }
  sofa(cx, cz, len, dep, face, c) {
    c = c || [0.45, 0.14, 0.14];
    const Fb = this.b('fabric'), alongX = (face === '+z' || face === '-z');
    const sx = alongX ? len : dep, sz = alongX ? dep : len;
    Fb.box(cx, 0.26, cz, sx, 0.52, sz, c, 0, 0.5);
    const fx = face === '+x' ? 1 : face === '-x' ? -1 : 0, fz = face === '+z' ? 1 : face === '-z' ? -1 : 0;
    const bx = cx - fx * (dep / 2 - 0.13), bz = cz - fz * (dep / 2 - 0.13);
    Fb.box(bx, 0.78, bz, alongX ? len : 0.26, 0.56, alongX ? 0.26 : len, c.map(v => v * 0.85), 0, 0.5);
    for (const s of [-1, 1]) {
      const ax = alongX ? cx + s * (len / 2 - 0.12) : cx, az = alongX ? cz : cz + s * (len / 2 - 0.12);
      Fb.box(ax, 0.55, az, alongX ? 0.24 : dep, 0.3, alongX ? dep : 0.24, c.map(v => v * 0.8), 0, 0.5);
    }
    this.col(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
  }
  shelf(cx, cz, along, len, dep, h) {
    const F = this.b('furn'), Fb = this.b('fabric'), r = this.rand, ax = along === 'x';
    const sx = ax ? len : dep, sz = ax ? dep : len, wood = [0.7, 0.5, 0.4];
    F.box(cx, h / 2, cz, sx, h, sz, [0.45, 0.32, 0.25], 0, 0.5);
    const lv = 5, pal = [[0.35, 0.05, 0.06], [0.08, 0.2, 0.12], [0.2, 0.14, 0.07], [0.1, 0.1, 0.22], [0.3, 0.25, 0.15], [0.05, 0.05, 0.05]];
    const open = ax ? 0 : 0;
    for (let l = 0; l < lv; l++) {
      const y = 0.25 + l * ((h - 0.35) / lv);
      F.box(cx, y, cz, sx + 0.04, 0.05, sz + 0.04, wood, 0, 0.5);
      let t = -len / 2 + 0.1;
      while (t < len / 2 - 0.12) {
        const w = 0.035 + r() * 0.05, bh = 0.18 + r() * 0.16, c = pal[(r() * pal.length) | 0];
        if (r() < 0.07) { t += 0.12 + r() * 0.2; continue; }
        const bd = dep * 0.55;
        // books stand with spines toward the open side (towards room): offset by wall side
        Fb.box(ax ? cx + t + w / 2 : cx, y + 0.025 + bh / 2, ax ? cz : cz + t + w / 2, ax ? w : bd, bh, ax ? bd : w, c, 0, 0.5);
        t += w + 0.004;
      }
    }
    this.col(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2);
  }
  bed(cx, cz, sgn) {
    const F = this.b('furn'), Fb = this.b('fabric');
    F.box(cx, 0.25, cz, 2.2, 0.3, 1.7, [0.7, 0.5, 0.4], 0, 0.5);
    Fb.box(cx, 0.52, cz, 2.1, 0.24, 1.6, [0.75, 0.72, 0.65], 0, 0.5);
    Fb.box(cx + sgn * 0.75, 0.7, cz - 0.4, 0.38, 0.14, 0.62, [0.85, 0.83, 0.78], 0, 0.5);
    Fb.box(cx + sgn * 0.75, 0.7, cz + 0.4, 0.38, 0.14, 0.62, [0.85, 0.83, 0.78], 0, 0.5);
    Fb.box(cx - sgn * 0.25, 0.66, cz, 1.4, 0.07, 1.64, [0.4, 0.05, 0.07], 0, 0.5);
    F.box(cx + sgn * 1.12, 0.65, cz, 0.12, 1.3, 1.8, [0.6, 0.42, 0.34], 0, 0.5);
    this.col(cx - 1.15, cz - 0.9, cx + 1.15, cz + 0.9);
  }
  crate(cx, cz, s, h, c) { this.fb('furn', cx, h / 2, cz, s, h, s, c || [0.85, 0.7, 0.5], true, 0.5); }
  barrel(cx, cz, r, h) {
    this.b('furn').cyl(cx, 0, cz, r, r, h, 12, [0.7, 0.55, 0.42], true, 0.5);
    this.b('furn').cyl(cx, h * 0.25, cz, r * 1.04, r * 1.04, 0.05, 12, [0.2, 0.2, 0.22], false, 0.5);
    this.b('furn').cyl(cx, h * 0.7, cz, r * 1.04, r * 1.04, 0.05, 12, [0.2, 0.2, 0.22], false, 0.5);
    this.col(cx - r, cz - r, cx + r, cz + r);
  }
  rug(cx, cz, w, d, c) {
    this.b('carpet').box(cx, 0.012, cz, w, 0.024, d, c || [1, 0.7, 0.7], 0, 0.5);
  }
  statue(cx, cz, c) {
    c = c || [0.62, 0.62, 0.66];
    const S = this.b('stone');
    S.box(cx, 0.35, cz, 0.8, 0.7, 0.8, [0.6, 0.6, 0.62], 0, 0.5);
    const K = this.b('skin');
    K.cyl(cx, 0.7, cz, 0.3, 0.14, 1.2, 10, c, false);
    K.sphere(cx, 2.1, cz, 0.15, 0.2, 0.15, 10, c);
    K.box(cx + 0.28, 1.65, cz, 0.12, 0.12, 0.55, c, 0);
    K.box(cx - 0.28, 1.5, cz, 0.12, 0.6, 0.12, c, 0);
    this.col(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4);
  }
  /* wall-mounted flat quad (normal n horizontal) */
  wallQuad(key, nx, nz, cx, cy, cz, w, h, uv, col) {
    const t = [nz, 0, -nx], hw = w / 2, hh = h / 2;
    const P = (a, b) => [cx + t[0] * hw * a, cy + hh * b, cz + t[2] * hw * a];
    this.b(key).quad([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [nx, 0, nz], col || [1, 1, 1], [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]]);
  }
  painting(x, y, z, nx, nz, k) {
    const u0 = (k % 2) * 0.5, v0 = (k >> 1) * 0.5, F = this.b('furn');
    const fw = Math.abs(nz) > 0 ? 1.2 : 0.1, fd = Math.abs(nz) > 0 ? 0.1 : 1.2;
    F.box(x + nx * 0.04, y, z + nz * 0.04, fw, 1.5, fd, [0.55, 0.4, 0.2], 0, 0.5);
    this.wallQuad('paint', nx, nz, x + nx * 0.095, y, z + nz * 0.095, 1.0, 1.3, [u0 + 0.02, v0 + 0.02, u0 + 0.48, v0 + 0.48], [1, 1, 1]);
  }
  addLight(o) {
    const l = Object.assign({ kind: 'steady', radius: 9, base: [1, 0.6, 0.3], k: 1, ph: this.rand() * 100, on: 1, w: 1 }, o);
    l.pos0 = l.pos.slice(); this.lights.push(l); return l;
  }
  addEmit(mesh, pos, col, light, mul, follow) { const e = { mesh, pos: pos.slice(), col, light, mul: mul || 1, follow: !!follow }; this.emit.push(e); return e; }
  candle(x, y, z, light, tall) {
    const h = tall || 0.14;
    this.b('fabric').cyl(x, y, z, 0.022, 0.022, h, 8, [0.9, 0.85, 0.7], true, 0.5);
    this.addEmit('flame', [x, y + h + 0.03, z], [3.2, 1.5, 0.45], light, 1);
  }
  candelabra(x, y, z, light) {
    this.b('furn').cyl(x, y, z, 0.07, 0.04, 0.25, 8, [0.35, 0.3, 0.12], true, 0.5);
    this.b('furn').box(x, y + 0.26, z, 0.4, 0.025, 0.04, [0.35, 0.3, 0.12], 0, 0.5);
    for (const o of [-0.17, 0, 0.17]) this.candle(x + o, y + 0.28, z, light, 0.1);
  }
  floorLamp(x, z, light, col) {
    const F = this.b('furn');
    F.cyl(x, 0, z, 0.2, 0.2, 0.05, 10, [0.15, 0.12, 0.1], false, 0.5);
    F.cyl(x, 0.05, z, 0.025, 0.025, 1.45, 8, [0.15, 0.12, 0.1], false, 0.5);
    this.col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    this.addEmit('shade', [x, 1.5, z], col || [2.0, 1.15, 0.5], light, 1);
  }
  window(x, z, nx, nz, light) {
    const y = 2.1;
    this.wallQuad('window', nx, nz, x + nx * 0.03, y, z + nz * 0.03, 1.5, 1.9, [0, 0, 1, 1], [1, 1, 1]);
    const F = this.b('fabric');
    const t = [nz, 0, -nx];
    // realistic dark fabric curtains (left heavier, right lighter/open)
    F.box(x + nx * 0.22 + t[0] * -0.65, 2.0, z + nz * 0.22 + t[2] * -0.65, Math.abs(nx) > 0 ? 0.1 : 0.48, 2.3, Math.abs(nz) > 0 ? 0.1 : 0.48, [0.18, 0.08, 0.07], 0, 0.5);
    F.box(x + nx * 0.22 + t[0] * 0.78, 2.05, z + nz * 0.22 + t[2] * 0.78, Math.abs(nx) > 0 ? 0.06 : 0.28, 2.1, Math.abs(nz) > 0 ? 0.06 : 0.28, [0.22, 0.1, 0.08], 0, 0.5);
    // frayed bottom suggestion with smaller boxes
    F.box(x + nx * 0.22 + t[0] * -0.65, 0.85, z + nz * 0.22 + t[2] * -0.65, Math.abs(nx) > 0 ? 0.08 : 0.42, 0.15, Math.abs(nz) > 0 ? 0.08 : 0.42, [0.12, 0.05, 0.04], 0, 0.5);
    // top valance
    F.box(x + nx * 0.2, 3.22, z + nz * 0.2, Math.abs(nx) > 0 ? 0.1 : 2.1, 0.1, Math.abs(nz) > 0 ? 0.1 : 2.1, [0.18, 0.12, 0.1], 0, 0.5);
    this.addLight({ pos: [x + nx * 1.1, y, z + nz * 1.1], base: [0.28, 0.42, 1.0], k: 4.5, radius: 7.5, kind: 'moon' });
  }
  /* ---- outdoor helpers ---- */
  ground(key, x0, z0, x1, z1, y, col, tile) {
    const t = tile || 4;
    this.b(key).quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], col || [1, 1, 1], [[x0 / t, z0 / t], [x1 / t, z0 / t], [x1 / t, z1 / t], [x0 / t, z1 / t]]);
  }
  slab(key, x0, z0, x1, z1, h, col) {
    const B = this.b(key), vv = h / WH, w = x1 - x0, d = z1 - z0;
    B.quad([[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], col, [[0, vv], [w / 2, vv], [w / 2, 0], [0, 0]]);
    B.quad([[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], col, [[0, vv], [w / 2, vv], [w / 2, 0], [0, 0]]);
    B.quad([[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], col, [[0, vv], [d / 2, vv], [d / 2, 0], [0, 0]]);
    B.quad([[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], col, [[0, vv], [d / 2, vv], [d / 2, 0], [0, 0]]);
  }
  pine(x, z, h) {
    const r = this.rand, F = this.b('furn'), L = this.b('fabric');
    F.cyl(x, 0, z, 0.16 * h / 6, 0.1 * h / 6, h * 0.45, 6, [0.32, 0.2, 0.12], false, 0.5);
    const g = [0.05 + r() * 0.04, 0.14 + r() * 0.08, 0.06 + r() * 0.03];
    for (let k = 0; k < 3; k++) L.cyl(x, h * (0.25 + k * 0.22), z, h * (0.3 - k * 0.07), 0.02, h * 0.4, 7, g, false, 0.5);
    this.col(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  }
  oak(x, z, h) {
    const r = this.rand, L = this.b('fabric');
    this.b('furn').cyl(x, 0, z, 0.3, 0.2, h * 0.55, 7, [0.3, 0.2, 0.12], false, 0.5);
    const g = [0.06 + r() * 0.03, 0.16 + r() * 0.06, 0.05];
    L.sphere(x, h * 0.75, z, h * 0.3, h * 0.24, h * 0.3, 8, g);
    L.sphere(x + h * 0.14, h * 0.62, z + h * 0.05, h * 0.2, h * 0.17, h * 0.2, 7, g);
    L.sphere(x - h * 0.12, h * 0.66, z - h * 0.1, h * 0.2, h * 0.17, h * 0.2, 7, g);
    this.col(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  building(x0, z0, x1, z1, r) {
    const w = x1 - x0, d = z1 - z0, fl = 2 + ((r() * 3) | 0), h = fl * WH, t = 0.75 + r() * 0.5;
    const col = [t, t * (0.85 + r() * 0.15), t * (0.8 + r() * 0.2)];
    this.slab('brick', x0, z0, x1, z1, h, col);
    this.b('stone').box((x0 + x1) / 2, h + 0.12, (z0 + z1) / 2, w + 0.5, 0.24, d + 0.5, [0.25, 0.24, 0.26], 0, 0.5);
    this.col(x0, z0, x1, z1);
    const facades = [[0, 1, x0, x1, z1], [0, -1, x0, x1, z0], [1, 0, z0, z1, x1], [-1, 0, z0, z1, x0]];
    for (const f of facades) {
      const nx = f[0], nz = f[1], a0 = f[2], a1 = f[3], fix = f[4], L = a1 - a0, cnt = Math.floor((L - 1) / 3);
      for (let i = 0; i < cnt; i++) {
        const pos = a0 + (i + 0.5) * L / cnt;
        for (let k = 0; k < fl; k++) {
          const cy = 1.9 + k * WH, lit = r() < 0.18;
          const px = nz !== 0 ? pos : fix + nx * 0.03, pz = nz !== 0 ? fix + nz * 0.03 : pos;
          if (lit) { const q = 0.6 + 0.4 * r(), c = r() < 0.2 ? [0.5, 0.7, 1] : [1, 0.8 * q, 0.45 * q]; this.wallQuad('litwin', nx, nz, px, cy, pz, 1.1, 1.6, [0, 0, 1, 1], c); }
          else this.wallQuad('glass', nx, nz, px, cy, pz, 1.1, 1.6, [0, 0, 1, 1], [0.015, 0.02, 0.035]);
        }
      }
    }
  }
  finish(R) {
    const out = { static: [], cols: this.cols, lights: this.lights, emit: this.emit, pages: this.pages, items: this.items, hides: this.hides, keyItem: this.keyItem, doors: this.doors, doorAt: this.doorAt, solid: this.solid, roomOf: this.roomOf };
    for (const k in this.B) if (this.B[k].i.length) out.static.push({ key: k, mesh: R.mesh(this.B[k]) });
    return out;
  }
}

/* ============ populate the mansion ============ */
function populate(wb) {
  const R = id => { const r = ROOMS[id]; return { x0: r.x0 * 2, x1: (r.x1 + 1) * 2, z0: r.y0 * 2, z1: (r.y1 + 1) * 2, cx: (r.x0 + r.x1 + 1), cz: (r.y0 + r.y1 + 1) }; };
  const F = (k, ...a) => wb.fb(k, ...a);
  const page = (x, y, z, ry) => wb.pages.push({ pos: [x, y, z], ry: ry || 0, got: false, ph: Math.random() * 6 });
  const item = (type, x, y, z, amt, ry) => wb.items.push({ type, pos: [x, y, z], amt: amt || 0, ry: ry || 0, got: false, ph: Math.random() * 6 });
  const hide = (x, z, fx, fz, room) => {
    wb.hides.push({ x, z, fx, fz, room });
    const fu = wb.b('furn');
    const sx = fx !== 0 ? 0.7 : 1.3, sz = fz !== 0 ? 0.7 : 1.3;
    fu.box(x, 1.1, z, sx, 2.2, sz, [0.62, 0.42, 0.3], 0, 0.5);
    // door slits on the facing side
    fu.box(x + fx * (sx / 2 + 0.005), 1.1, z + fz * (sz / 2 + 0.005), fx !== 0 ? 0.02 : 0.04, 2.0, fz !== 0 ? 0.02 : 0.04, [0.05, 0.03, 0.02], 0, 0.5);
    wb.col(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2);
  };

  /* ---- lobby (0) ---- */
  { const r = R(0);
    wb.rug(r.cx, r.cz - 1, 8, 5, [1, 0.6, 0.55]);
    wb.table(r.x0 + 1.2, r.z0 + 1.2, 1.6, 0.7, 0.85, [0.8, 0.65, 0.5]);
    wb.candelabra(r.x0 + 1.2, 0.89, r.z0 + 1.2, wb.addLight({ pos: [r.x0 + 1.3, 1.4, r.z0 + 1.4], base: [1, 0.55, 0.22], k: 2.4, radius: 8.5, kind: 'flicker' }));
    wb.window(r.x0 + 4, r.z1, 0, -1); wb.window(r.x1 - 4, r.z1, 0, -1);
    wb.statue(r.x1 - 1, r.z0 + 1.2); wb.statue(r.x0 + 1, r.z1 - 1.2);
    wb.painting(r.x1, 2, r.cz, -1, 0, 0);
    wb.painting(r.x0, 2, r.cz + 3, 1, 0, 2);
    wb.sofa(r.x1 - 1.1, r.cz + 3, 2.2, 0.9, '-x', [0.3, 0.08, 0.12]);
    wb.crate(r.x0 + 1, r.z1 - 1, 0.7, 0.7);
    page(r.x0 + 1.2, 1.0, r.z0 + 1.2 + 0.0, 0.3);
    wb.pages[wb.pages.length - 1].pos = [r.x0 + 1.5, 0.9, r.z0 + 1.1];
    item('ammoP', r.x0 + 0.8, 0.93, r.z0 + 1.2, 6);
    hide(r.x0 + 0.5, r.cz, 1, 0, 0);
  }
  /* ---- grand hall (1) ---- */
  { const r = R(1);
    wb.window(r.cx - 6, r.z0, 0, 1); wb.window(r.cx + 6, r.z0, 0, 1);
    wb.addLight({ pos: [r.cx, 2.9, r.cz], base: [0.8, 0.85, 1], k: 1.15, radius: 7, kind: 'buzz' });
    wb.table(r.cx, r.cz + 5.5, 3.2, 0.9, 0.85, [0.7, 0.55, 0.42]);
    wb.candelabra(r.cx - 0.8, 0.89, r.cz + 5.5, wb.addLight({ pos: [r.cx - 0.7, 1.5, r.cz + 5.3], base: [1, 0.6, 0.25], k: 2.0, radius: 8, kind: 'flicker' }));
    wb.candelabra(r.cx + 0.8, 0.89, r.cz + 5.5, null);
    wb.painting(r.x0, 2, r.cz - 2, 1, 0, 1); wb.painting(r.x1, 2, r.cz + 3, -1, 0, 3);
    wb.statue(r.x0 + 1.2, r.z1 - 1.2); wb.statue(r.x1 - 1.2, r.z1 - 1.2);
    wb.barrel(r.x1 - 0.9, r.z0 + 1, 0.4, 0.9);
    page(r.cx + 1.2, 0.95, r.cz + 5.4, 0); wb.pages[wb.pages.length - 1].pos = [r.cx + 0.0, 0.9, r.cz + 5.55];
    item('ammoP', r.cx + 1.4, 0.93, r.cz + 5.5, 6);
    hide(r.x0 + 0.5, r.cz - 4.5, 1, 0, 1);
    hide(r.x1 - 0.5, r.cz + 1, -1, 0, 1);
  }
  /* ---- living room (2) ---- */
  { const r = R(2);
    wb.rug(r.cx, r.cz, 7, 5, [0.95, 0.75, 0.7]);
    wb.sofa(r.cx - 1, r.cz + 3.4, 3.0, 1.0, '-z', [0.32, 0.1, 0.1]);
    wb.sofa(r.x0 + 1.0, r.cz, 2.6, 1.0, '+x', [0.26, 0.09, 0.12]);
    wb.table(r.cx - 0.5, r.cz, 1.6, 0.8, 0.45, [0.5, 0.4, 0.32]);
    // fireplace on north wall
    const fx = r.cx - 1.5, fz = r.z0;
    F('stone', fx, 1.3, fz + 0.35, 3.2, 2.6, 0.7, [0.8, 0.8, 0.85], true, 0.4);
    F('furn', fx, 0.45, fz + 0.75, 1.4, 0.9, 0.12, [0.03, 0.03, 0.03], false, 0.5);
    const fl = wb.addLight({ pos: [fx, 0.7, fz + 1.1], base: [1, 0.42, 0.14], k: 4.2, radius: 10.5, kind: 'flicker', w: 1.5 });
    wb.addEmit('fire', [fx, 0.45, fz + 0.72], [3.8, 1.2, 0.3], fl, 1);
    wb.floorLamp(r.x1 - 0.8, r.z1 - 0.8, wb.addLight({ pos: [r.x1 - 0.8, 1.5, r.z1 - 0.9], base: [1, 0.75, 0.4], k: 1.1, radius: 6, kind: 'buzz' }), [1.6, 1.0, 0.5]);
    wb.painting(r.x0, 2, r.cz - 5, 1, 0, 0);
    wb.window(r.x0, r.cz + 0.0, 1, 0);
    wb.shelf(r.x1 - 0.3, r.cz - 1.5, 'z', 3, 0.5, 2.5);
    wb.crate(r.x1 - 1.2, r.z1 - 3.5, 0.6, 0.6);
    page(r.x0 + 1.4, 0.55, r.cz - 0.2, 0); wb.pages[wb.pages.length - 1].pos = [r.cx - 0.5, 0.5, r.cz];
    item('ammoP', r.cx + 0.15, 0.5, r.cz + 0.15, 6);
    hide(r.cx + 3.2, r.z0 + 0.4, 0, 1, 2);
  }
  /* ---- library (3) : needs key ---- */
  { const r = R(3);
    wb.shelf(r.cx - 4, r.z0 + 0.35, 'x', 5.5, 0.55, 3.0);
    wb.shelf(r.cx + 3, r.z0 + 0.35, 'x', 5.5, 0.55, 3.0);
    wb.shelf(r.x1 - 0.35, r.cz, 'z', 7, 0.55, 3.0);
    wb.shelf(r.x0 + 0.35, r.cz + 3, 'z', 6, 0.55, 3.0);
    wb.shelf(r.cx - 3, r.cz + 0.5, 'x', 4, 0.5, 2.4);
    wb.shelf(r.cx + 2, r.cz + 0.5, 'x', 4, 0.5, 2.4);
    wb.table(r.cx, r.cz + 3.4, 2.6, 1.1, 0.8, [0.55, 0.4, 0.3]);
    wb.chair(r.cx - 0.8, r.cz + 4.3, 0, -1); wb.chair(r.cx + 0.8, r.cz + 4.3, 0, -1);
    wb.candelabra(r.cx, 0.84, r.cz + 3.4, wb.addLight({ pos: [r.cx, 1.35, r.cz + 3.2], base: [1, 0.62, 0.28], k: 2.3, radius: 9, kind: 'flicker' }));
    wb.floorLamp(r.x0 + 1, r.z0 + 1.2, wb.addLight({ pos: [r.x0 + 1, 1.5, r.z0 + 1.3], base: [0.95, 0.7, 0.35], k: 1.0, radius: 6, kind: 'buzz' }), [1.5, 0.95, 0.45]);
    wb.window(r.x1, r.cz + 0, -1, 0);
    page(r.cx, 0.9, r.cz + 3.4, 0); wb.pages[wb.pages.length - 1].pos = [r.cx + 0.6, 0.85, r.cz + 3.55];
    page(r.x1 - 1.5, 0.5, r.cz - 4, 0); wb.pages[wb.pages.length - 1].pos = [r.cx + 5, 1.45, r.cz - 3];
    item('sniper', r.cx - 0.75, 0.9, r.cz + 3.55, 0, 0.5);
    item('ammoS', r.cx - 0.35, 0.86, r.cz + 3.15, 3);
    item('ammoS', r.cx + 4, 0.08, r.cz + 2, 3);
    wb.rug(r.cx, r.cz + 3, 5, 3.4, [0.8, 0.7, 0.9]);
    hide(r.x0 + 0.5, r.z0 + 3, 1, 0, 3);
  }
  /* ---- kitchen (4) ---- */
  { const r = R(4);
    wb.addLight({ pos: [r.cx, 2.9, r.cz], base: [0.7, 1, 0.82], k: 1.7, radius: 8, kind: 'buzz', w: 2.2 });
    const tb = [0.7, 0.72, 0.7];
    F('white', r.x0 + 0.4, 0.45, r.z0 + 6, 0.8, 0.9, 8, tb, true, 0.5);
    F('white', r.cx, 0.45, r.z0 + 0.4, 6, 0.9, 0.8, tb, true, 0.5);
    F('white', r.cx, 1.1, r.cz - 0.5, 3.2, 0.1, 1.6, [0.6, 0.62, 0.6], false, 0.5);
    wb.table(r.cx, r.cz - 0.5, 3.2, 1.6, 1.0, [0.6, 0.62, 0.6]);
    wb.b('white').cyl(r.x0 + 0.5, 0.9, r.z0 + 4, 0.22, 0.22, 0.3, 10, [0.6, 0.6, 0.65], false);
    F('white', r.x1 - 0.5, 1.0, r.z1 - 1.5, 1.0, 2.0, 1.0, [0.78, 0.8, 0.78], true, 0.5);
    wb.barrel(r.x1 - 0.8, r.z0 + 0.8, 0.45, 1.0);
    wb.window(r.x0, r.cz + 2, 1, 0); wb.window(r.cx + 3, r.z0, 0, 1);
    wb.crate(r.x1 - 1.0, r.cz, 0.7, 0.7);
    page(r.cx, 1.2, r.cz - 0.5, 0); wb.pages[wb.pages.length - 1].pos = [r.cx + 0.6, 1.16, r.cz - 0.2];
    wb.keyItem = { pos: [r.x1 - 1.0, 0.86, r.cz], got: false };
    item('ammoP', r.cx + 1.2, 0.95, r.z0 + 0.4, 6);
    hide(r.x1 - 0.5, r.z0 + 4, -1, 0, 4);
  }
  /* ---- dining (5) ---- */
  { const r = R(5);
    wb.table(r.cx, r.cz, 7, 1.6, 0.85, [0.45, 0.3, 0.22]);
    for (let i = -3; i <= 3; i += 2) { wb.chair(r.cx + i, r.cz - 1.4, 0, 1); wb.chair(r.cx + i, r.cz + 1.4, 0, -1); }
    wb.chair(r.cx - 4.2, r.cz, 1, 0); wb.chair(r.cx + 4.2, r.cz, -1, 0);
    const l1 = wb.addLight({ pos: [r.cx - 1.4, 1.45, r.cz], base: [1, 0.55, 0.2], k: 2.6, radius: 9.5, kind: 'flicker' });
    wb.candelabra(r.cx - 1.4, 0.89, r.cz, l1); wb.candelabra(r.cx + 1.4, 0.89, r.cz, l1);
    for (const o of [-2.6, 0.2, 2.8]) wb.b('furn').box(r.cx + o, 0.9, r.cz + 0.2, 0.3, 0.04, 0.3, [0.85, 0.85, 0.85], 0, 0.5);
    wb.window(r.cx - 3, r.z0, 0, 1); wb.window(r.cx + 5, r.z0, 0, 1);
    wb.shelf(r.x1 - 0.3, r.cz + 4, 'z', 3, 0.5, 2.0);
    wb.painting(r.x0, 2, r.cz + 3, 1, 0, 3); wb.painting(r.x1, 2, r.cz - 4, -1, 0, 1);
    wb.statue(r.x0 + 1, r.z1 - 1);
    wb.rug(r.cx, r.cz, 9, 4.5, [0.7, 0.55, 0.55]);
    page(r.cx + 3.0, 0.9, r.cz, 0); wb.pages[wb.pages.length - 1].pos = [r.cx + 3.0, 0.9, r.cz + 0.1];
    item('pistol', r.cx - 3.0, 0.9, r.cz + 0.1, 0, 0.4);
    item('ammoP', r.cx - 0.9, 0.9, r.cz - 0.4, 6);
    hide(r.x0 + 0.5, r.z0 + 3, 1, 0, 5);
  }
  /* ---- bedroom (6) ---- */
  { const r = R(6);
    wb.bed(r.x1 - 1.5, r.cz - 2, 1);
    wb.table(r.x1 - 1.1, r.cz + 0.3, 0.7, 0.6, 0.55, [0.7, 0.5, 0.4]);
    wb.floorLamp(r.x1 - 0.7, r.cz - 4.8, wb.addLight({ pos: [r.x1 - 0.7, 1.5, r.cz - 4.7], base: [1, 0.72, 0.4], k: 1.0, radius: 6, kind: 'buzz', w: 1.4 }), [1.5, 0.95, 0.45]);
    wb.candle(r.x1 - 1.1, 0.59, r.cz + 0.3, wb.addLight({ pos: [r.x1 - 1.2, 1.0, r.cz + 0.4], base: [1, 0.55, 0.22], k: 1.6, radius: 7, kind: 'flicker' }), 0.12);
    wb.rug(r.cx - 1, r.cz, 6, 4, [0.55, 0.5, 0.75]);
    wb.shelf(r.x0 + 0.3, r.cz + 3, 'z', 3, 0.5, 2.2);
    wb.window(r.cx - 2, r.z0, 0, 1); wb.window(r.cx + 3, r.z0, 0, 1);
    wb.painting(r.x0, 2, r.cz - 3, 1, 0, 3);
    wb.crate(r.x0 + 1.2, r.z1 - 1, 0.8, 0.8);
    page(r.cx, 0.6, r.cz, 0); wb.pages[wb.pages.length - 1].pos = [r.x1 - 1.5, 0.8, r.cz - 2];
    item('ammoP', r.x1 - 1.1, 0.6, r.cz + 0.5, 6);
    hide(r.cx - 3, r.z1 - 0.4, 0, -1, 6);
  }
  /* ---- storage (7) ---- */
  { const r = R(7);
    wb.addLight({ pos: [r.cx, 2.9, r.cz], base: [1, 0.85, 0.55], k: 1.2, radius: 8, kind: 'buzz', w: 2.8 });
    const rr = rng(33);
    for (let k = 0; k < 14; k++) {
      const x = r.x0 + 1.5 + rr() * 15, z = r.z0 + 1.5 + rr() * 13;
      const dxc = Math.abs(x - r.cx), dzc = Math.abs(z - r.cz);
      if ((x > 16 && x < 18.2 && z < 46) || (z > 54.5 && z < 56.5 && x > r.x1 - 2.5)) continue;
      if (x > r.x1 - 2.6 && z > 50 && z < 56) continue;
      if (rr() < 0.5) wb.crate(x, z, 0.8 + rr() * 0.4, 0.8 + rr() * 0.5, [0.8 + rr() * 0.2, 0.65, 0.45]);
      else wb.barrel(x, z, 0.38 + rr() * 0.1, 0.85 + rr() * 0.3);
    }
    wb.shelf(r.x0 + 0.3, r.cz + 3, 'z', 5, 0.5, 2.6);
    wb.shelf(r.cx, r.z1 - 0.3, 'x', 5, 0.5, 2.6);
    wb.table(r.x1 - 1.2, r.z0 + 1.5, 1.8, 0.9, 0.9, [0.6, 0.5, 0.4]);
    wb.window(r.x0, r.cz - 2, 1, 0);
    page(r.x1 - 1.2, 1.0, r.z0 + 1.5, 0); wb.pages[wb.pages.length - 1].pos = [r.x1 - 1.1, 0.96, r.z0 + 1.5];
    item('ammoS', r.x1 - 1.7, 0.95, r.z0 + 1.5, 3);
    item('ammoP', r.x0 + 1.0, 0.08, r.z0 + 1.0, 6);
    hide(r.x1 - 0.5, r.z1 - 3, -1, 0, 7);
  }
  /* ---- chapel (8) ---- */
  { const r = R(8);
    // pews
    for (let row = 0; row < 4; row++) for (const s of [-1, 1]) {
      const px = r.cx + s * 3.0, pz = r.z0 + 4 + row * 2.2;
      wb.b('furn').box(px, 0.45, pz, 3.0, 0.08, 0.5, [0.55, 0.4, 0.3], 0, 0.5);
      wb.b('furn').box(px, 0.9, pz - 0.28, 3.0, 0.9, 0.08, [0.5, 0.36, 0.28], 0, 0.5);
      wb.col(px - 1.5, pz - 0.3, px + 1.5, pz + 0.28);
    }
    // altar
    const ax = r.cx, az = r.z1 - 1.2;
    F('stone', ax, 0.5, az, 3.0, 1.0, 1.0, [0.9, 0.9, 1], true, 0.5);
    const al = wb.addLight({ pos: [ax, 1.6, az - 0.6], base: [1, 0.6, 0.3], k: 2.6, radius: 10, kind: 'flicker', w: 1.2 });
    wb.candelabra(ax - 1, 1.02, az, al); wb.candelabra(ax + 1, 1.02, az, al); wb.candelabra(ax, 1.02, az, al);
    // cross
    wb.b('furn').box(ax, 2.5, r.z1 - 0.1, 0.18, 1.7, 0.08, [0.4, 0.3, 0.2], 0, 0.5);
    wb.b('furn').box(ax, 2.8, r.z1 - 0.1, 0.9, 0.18, 0.08, [0.4, 0.3, 0.2], 0, 0.5);
    wb.window(r.x1, r.cz - 3, -1, 0); wb.window(r.x1, r.cz + 3, -1, 0); wb.window(r.x0, r.cz, 1, 0);
    wb.statue(r.x0 + 0.9, r.z1 - 1); wb.statue(r.x1 - 0.9, r.z1 - 1);
    wb.painting(r.cx, 2.2, r.z0, 0, 1, 2);
    page(ax, 1.1, az, 0); wb.pages[wb.pages.length - 1].pos = [ax + 0.0, 1.05, az + 0.1];
    item('ammoS', ax - 0.5, 1.05, az + 0.3, 3);
    hide(r.x0 + 0.5, r.z0 + 2, 1, 0, 8);
  }
  // spaced fill: corridors dim lamps
  wb.addLight({ pos: [28.2, 2.5, 33], base: [0.9, 0.7, 0.45], k: 0.5, radius: 5, kind: 'flicker' });
  wb.addLight({ pos: [41, 2.4, 43], base: [0.35, 0.5, 1.0], k: 0.9, radius: 4.5, kind: 'moon' });
  wb.addLight({ pos: [54.5, 2.5, 33], base: [0.9, 0.7, 0.45], k: 0.5, radius: 5, kind: 'flicker' });
}

/* ============ the outside world: garden, fence, street, town, forest ============ */
function buildOutside(wb) {
  const rr = rng(777), IR = [0.05, 0.05, 0.06], WIRE = [0.4, 0.4, 0.42];
  const I = wb.b('iron');
  const item = (type, x, y, z, amt, ry) => wb.items.push({ type, pos: [x, y, z], amt: amt || 0, ry: ry || 0, got: false, ph: Math.random() * 6 });

  /* ground, roads, sidewalks */
  wb.ground('grass', -330, -330, 480, 520, -0.1, [1, 1, 1], 6);
  wb.ground('stone', 40, 64, 44, 106, 0.0, [0.8, 0.78, 0.74], 2);
  wb.ground('stone', 36, 64, 48, 67, 0.0, [0.75, 0.73, 0.7], 2);
  const road = (x0, z0, x1, z1) => wb.ground('road', x0, z0, x1, z1, 0.0, [1, 1, 1], 4);
  road(-330, 110, 480, 122);             // main street (A)
  road(36, 122, 48, 300); road(36, 340, 48, 420); // town avenue (B)
  road(-130, 185, 36, 195); road(48, 185, 210, 195);
  road(-130, 245, 36, 255); road(48, 245, 210, 255);
  wb.ground('stone', 22, 300, 62, 340, 0.02, [0.7, 0.7, 0.72], 3); // plaza
  const dash = (x0, z0, x1, z1) => wb.ground('white', x0, z0, x1, z1, 0.012, [0.85, 0.72, 0.3], 4);
  for (let x = -320; x < 470; x += 8) if (!(x + 4 > 34 && x < 50)) dash(x, 115.85, x + 4, 116.15);
  for (let z = 124; z < 296; z += 8) dash(41.85, z, 42.15, z + 4);
  for (let z = 344; z < 416; z += 8) dash(41.85, z, 42.15, z + 4);
  for (let x = -128; x < 34; x += 8) { dash(x, 189.85, x + 4, 190.15); dash(x, 249.85, x + 4, 250.15); }
  for (let x = 50; x < 208; x += 8) { dash(x, 189.85, x + 4, 190.15); dash(x, 249.85, x + 4, 250.15); }
  const SW = wb.b('stone');
  const sw = (x0, z0, x1, z1) => SW.box((x0 + x1) / 2, 0.01, (z0 + z1) / 2, x1 - x0, 0.22, z1 - z0, [0.55, 0.55, 0.58], 0, 0.25);
  sw(-330, 106, 480, 110);
  sw(-330, 122, 36, 126); sw(48, 122, 480, 126);
  for (const seg of [[126, 185], [195, 245], [255, 300], [340, 420]]) { sw(32, seg[0], 36, seg[1]); sw(48, seg[0], 52, seg[1]); }

  /* iron fence with barbed wire */
  const fenceSide = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.55)), dx = (x1 - x0) / L, dz = (z1 - z0) / L, alongX = Math.abs(dx) > 0.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const y of [0.35, 1.0, 2.05]) I.box(cx, y, cz, alongX ? L : 0.05, 0.06, alongX ? 0.05 : L, IR, 0, 0.5);
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * L * i / n, z = z0 + dz * L * i / n;
      I.box(x, 1.1, z, 0.035, 2.2, 0.035, IR, 0, 0.5);
      I.cyl(x, 2.2, z, 0.03, 0.0, 0.16, 4, IR, false, 0.5);
    }
    const np = Math.max(1, Math.round(L / 4));
    for (let i = 0; i <= np; i++) {
      const x = x0 + dx * L * i / np, z = z0 + dz * L * i / np;
      I.box(x, 1.4, z, 0.14, 2.8, 0.14, [0.07, 0.07, 0.08], 0, 0.5);
      I.box(x, 2.85, z, 0.2, 0.08, 0.2, IR, 0, 0.5);
    }
    const ys = [2.45, 2.65, 2.85];
    for (const y of ys) I.box(cx, y, cz, alongX ? L : 0.012, 0.012, alongX ? 0.012 : L, WIRE, 0, 0.5);
    const nb = Math.round(L / 0.8);
    for (let i = 0; i < nb; i++) {
      const t = (i + 0.5) / nb, x = x0 + dx * L * t, z = z0 + dz * L * t, y = ys[i % 3];
      I.box(x, y, z, 0.07, 0.02, 0.02, WIRE, 0, 0.5);
      I.box(x, y, z, 0.02, 0.02, 0.07, WIRE, 0, 0.5);
    }
    if (alongX) wb.col(Math.min(x0, x1), z0 - 0.2, Math.max(x0, x1), z0 + 0.2); else wb.col(x0 - 0.2, Math.min(z0, z1), x0 + 0.2, Math.max(z0, z1));
  };
  fenceSide(FX0, FZ0, FX1, FZ0);
  fenceSide(FX0, FZ0, FX0, FZ1);
  fenceSide(FX1, FZ0, FX1, FZ1);
  fenceSide(FX0, FZ1, GATE0, FZ1);
  fenceSide(GATE1, FZ1, FX1, FZ1);

  /* street lamps */
  const lamp = (x, z, k) => {
    I.cyl(x, 0, z, 0.08, 0.05, 4.3, 6, IR, false, 0.5);
    I.box(x, 4.35, z, 0.3, 0.06, 0.3, IR, 0, 0.5);
    const L = wb.addLight({ pos: [x, 4.2, z], base: [1, 0.78, 0.5], k: k || 4.5, radius: 19, kind: rr() < 0.25 ? 'buzz' : 'steady', w: 1.3 });
    wb.addEmit('lamp', [x, 4.5, z], [3.0, 2.2, 1.1], L, 1);
    wb.col(x - 0.12, z - 0.12, x + 0.12, z + 0.12);
  };
  /* gate pillars with lanterns */
  for (const gx of [GATE0, GATE1]) {
    wb.b('brick').box(gx, 1.4, FZ1, 0.9, 2.8, 0.9, [0.8, 0.72, 0.68], 0, 0.5);
    wb.b('stone').box(gx, 2.9, FZ1, 1.1, 0.2, 1.1, [0.4, 0.4, 0.42], 0, 0.5);
    wb.col(gx - 0.45, FZ1 - 0.45, gx + 0.45, FZ1 + 0.45);
    const L = wb.addLight({ pos: [gx, 3.4, FZ1 - 0.6], base: [1, 0.7, 0.4], k: 3.2, radius: 14, kind: 'flicker', w: 0.8 });
    wb.addEmit('lamp', [gx, 3.3, FZ1], [3.0, 1.8, 0.8], L, 1);
  }
  for (let x = -120; x <= 210; x += 26) lamp(x, 108, 4.5);
  for (let x = -108; x <= 222; x += 26) lamp(x, 124, 4.5);
  for (let z = 140; z <= 290; z += 24) { lamp(34, z); lamp(50, z + 12); }
  for (let z = 350; z <= 410; z += 24) lamp(34, z);
  for (const zz of [184, 244]) for (const x of [-100, -50, 0, 80, 130, 180]) lamp(x, zz, 4.2);
  for (const p of [[26, 304], [58, 304], [26, 336], [58, 336]]) lamp(p[0], p[1], 5);
  for (const z of [72, 86, 98]) { lamp(36.5, z, 3.6); lamp(47.5, z, 3.6); }

  /* garden */
  const inHouse = (x, z) => x > -3 && x < 87 && z > -3 && z < 67;
  const inPath = (x, z) => x > 33 && x < 51 && z > 60 && z < 108;
  let placed = 0, guard = 0;
  while (placed < 16 && guard++ < 400) {
    const x = FX0 + 4 + rr() * (FX1 - FX0 - 8), z = FZ0 + 4 + rr() * (FZ1 - FZ0 - 8);
    if (inHouse(x, z) || inPath(x, z) || (x > 0 && x < 14 && z > 76 && z < 90)) continue;
    wb.oak(x, z, 5 + rr() * 3); placed++;
  }
  const BushL = wb.b('fabric');
  placed = 0; guard = 0;
  while (placed < 44 && guard++ < 600) {
    const x = FX0 + 2 + rr() * (FX1 - FX0 - 4), z = FZ0 + 2 + rr() * (FZ1 - FZ0 - 4);
    if (inHouse(x, z) || inPath(x, z)) continue;
    const g = [0.05 + rr() * 0.04, 0.15 + rr() * 0.1, 0.05];
    BushL.sphere(x, 0.4, z, 0.7 + rr() * 0.4, 0.5, 0.7 + rr() * 0.4, 6, g);
    wb.col(x - 0.4, z - 0.4, x + 0.4, z + 0.4); placed++;
  }
  wb.slab('brick', 3, 80, 11, 86, 3.0, [0.7, 0.65, 0.6]);
  wb.b('stone').box(7, 3.1, 83, 8.6, 0.24, 6.6, [0.25, 0.24, 0.26], 0, 0.5);
  wb.col(3, 80, 11, 86);
  wb.b('stone').cyl(78, 0, 88, 0.9, 0.9, 0.9, 12, [0.6, 0.6, 0.62], true, 0.5);
  wb.b('furn').cyl(78, 0.9, 88, 0.06, 0.06, 1.2, 6, [0.3, 0.2, 0.12], false, 0.5);
  wb.col(77, 87, 79, 89);
  wb.statue(30, 70); wb.statue(54, 70);
  const bench = (x, z, alongX) => {
    const Fu = wb.b('furn'), c = [0.4, 0.28, 0.18];
    if (alongX) { Fu.box(x, 0.45, z, 1.7, 0.08, 0.5, c, 0, 0.5); Fu.box(x, 0.8, z - 0.25, 1.7, 0.5, 0.06, c, 0, 0.5); wb.col(x - 0.85, z - 0.3, x + 0.85, z + 0.3); }
    else { Fu.box(x, 0.45, z, 0.5, 0.08, 1.7, c, 0, 0.5); Fu.box(x - 0.25, 0.8, z, 0.06, 0.5, 1.7, c, 0, 0.5); wb.col(x - 0.3, z - 0.85, x + 0.3, z + 0.85); }
  };
  bench(30.5, 86, false); bench(55, 92, false);
  item('ammoP', 12.8, 0.08, 83, 6);
  item('ammoP', 80.5, 0.08, 88.5, 6);
  item('ammoS', 54.8, 0.08, 93.5, 3);

  /* parked cars */
  const car = (x, z, alongX, c) => {
    const Fw = wb.b('white'), L = alongX ? 4.3 : 1.9, Wd = alongX ? 1.9 : 4.3;
    Fw.box(x, 0.6, z, L, 0.7, Wd, c, 0, 0.5);
    Fw.box(x, 1.2, z, alongX ? 2.3 : 1.7, 0.55, alongX ? 1.7 : 2.3, c.map(v => v * 0.8), 0, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) I.box(x + sx * (alongX ? L / 2 - 0.7 : Wd / 2 - 0.1), 0.32, z + sz * (alongX ? Wd / 2 - 0.1 : L / 2 - 0.7), alongX ? 0.7 : 0.25, 0.64, alongX ? 0.25 : 0.7, [0.03, 0.03, 0.03], 0, 0.5);
    wb.col(x - L / 2, z - Wd / 2, x + L / 2, z + Wd / 2);
  };
  car(-60, 111.8, true, [0.35, 0.1, 0.1]); car(120, 120.2, true, [0.1, 0.2, 0.3]); car(10, 120.2, true, [0.3, 0.3, 0.28]);
  car(37.8, 170, false, [0.25, 0.12, 0.05]); car(46.2, 230, false, [0.12, 0.25, 0.15]); car(37.8, 372, false, [0.3, 0.3, 0.32]);

  /* town: buildings lining the streets */
  const roads = [[-330, 110, 480, 122], [36, 122, 48, 420], [-130, 185, 210, 195], [-130, 245, 210, 255]];
  const placedB = [];
  const free = (x0, z0, x1, z1) => {
    for (const q of roads) if (x1 > q[0] - 5 && x0 < q[2] + 5 && z1 > q[1] - 5 && z0 < q[3] + 5) return false;
    if (x1 > 18 && x0 < 66 && z1 > 296 && z0 < 344) return false;
    if (x1 > -16 && x0 < 100 && z1 > -16 && z0 < 108) return false;
    for (const b of placedB) if (x1 > b[0] - 1.2 && x0 < b[2] + 1.2 && z1 > b[1] - 1.2 && z0 < b[3] + 1.2) return false;
    return true;
  };
  const rb = rng(9001);
  const put = (x0, z0, x1, z1) => { if (!free(x0, z0, x1, z1)) return false; placedB.push([x0, z0, x1, z1]); wb.building(x0, z0, x1, z1, rb); return true; };
  for (let z = 126; z < 410;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(30.5 - d, z, 30.5, z + w)) z += w + 1 + rb() * 3; else z += 3; }
  for (let z = 126; z < 410;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(53.5, z, 53.5 + d, z + w)) z += w + 1 + rb() * 3; else z += 3; }
  for (const road of [[185, 195], [245, 255]]) {
    for (let x = -128; x < 208;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(x, road[0] - 5.5 - d, x + w, road[0] - 5.5)) x += w + 1 + rb() * 3; else x += 3; }
    for (let x = -128; x < 208;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(x, road[1] + 5.5, x + w, road[1] + 5.5 + d)) x += w + 1 + rb() * 3; else x += 3; }
  }
  for (let x = -128; x < 208;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(x, 127.5, x + w, 127.5 + d)) x += w + 1 + rb() * 3; else x += 3; }
  for (let x = -128; x < -20;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(x, 104.5 - d, x + w, 104.5)) x += w + 1 + rb() * 3; else x += 3; }
  for (let x = 104; x < 208;) { const w = 8 + rb() * 8, d = 9 + rb() * 6; if (put(x, 104.5 - d, x + w, 104.5)) x += w + 1 + rb() * 3; else x += 3; }

  /* plaza: fountain + benches */
  { const S = wb.b('stone'), cx = SQ[0], cz = SQ[1];
    S.cyl(cx, 0, cz, 5, 5, 0.8, 24, [0.6, 0.6, 0.62], true, 0.5);
    wb.b('glass').cyl(cx, 0.7, cz, 4.6, 4.6, 0.05, 24, [0.02, 0.05, 0.1], true, 0.5);
    S.cyl(cx, 0.8, cz, 0.55, 0.35, 2.6, 10, [0.6, 0.6, 0.62], true, 0.5);
    S.cyl(cx, 3.2, cz, 1.4, 1.0, 0.4, 14, [0.6, 0.6, 0.62], true, 0.5);
    wb.col(cx - 5, cz - 5, cx + 5, cz + 5);
    bench(cx - 9, cz, false); bench(cx + 9, cz, false); bench(cx, cz - 9, true); bench(cx, cz + 9, true);
  }

  /* forest */
  const hole = (x, z) => {
    if (x > FX0 - 8 && x < FX1 + 8 && z > FZ0 - 8 && z < FZ1 + 8) return true;
    if (z > 100 && z < 132) return true;
    for (const q of roads) if (x > q[0] - 7 && x < q[2] + 7 && z > q[1] - 7 && z < q[3] + 7) return true;
    if (x > -150 && x < 225 && z > 125 && z < 380) return true;
    return false;
  };
  for (let gx = -230; gx < 380; gx += 10) for (let gz = -220; gz < 520; gz += 10) {
    if (rr() > 0.88) continue;
    const x = gx + (rr() - 0.5) * 8, z = gz + (rr() - 0.5) * 8;
    if (hole(x, z)) continue;
    wb.pine(x, z, 5 + rr() * 6);
  }
  // invisible walls at the edge of the playable world
  wb.col(BX0 - 4, BZ0 - 4, BX0, BZ1 + 4); wb.col(BX1, BZ0 - 4, BX1 + 4, BZ1 + 4);
  wb.col(BX0 - 4, BZ0 - 4, BX1 + 4, BZ0); wb.col(BX0 - 4, BZ1, BX1 + 4, BZ1 + 4);
}

/* ============ procedural audio engine (WebAudio) ============ */
class Sound {
  constructor() {
    this.ok = false; this.muted = false;
  }
  init() {
    if (this.ok) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(c.destination);
    // reverb
    this.rev = c.createConvolver();
    const len = c.sampleRate * 2.8, ib = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev.buffer = ib;
    this.revIn = c.createGain(); this.revIn.gain.value = 0.55;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.revIn.connect(lp); lp.connect(this.rev); this.rev.connect(this.master);
    this.dry = c.createGain(); this.dry.connect(this.master); this.dry.connect(this.revIn);
    // noise buffers
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const pb = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), pd = pb.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < pd.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
    this.pinkBuf = pb;
    this.ok = true;
    this.startAmbient();
  }
  noise(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf || this.noiseBuf; s.loop = true; return s; }
  env(g, t, a, d, peak, sus) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + d); }
  startAmbient() {
    const c = this.ctx, t = c.currentTime;
    // dark drone: detuned low oscillators through slowly moving lowpass
    const dg = this.droneG = c.createGain(); dg.gain.value = 0.0;
    dg.gain.linearRampToValueAtTime(0.2, t + 6);
    const lp = this.droneLP = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 3;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    this.droneOsc = [];
    [[41.2, 'sawtooth', 0], [41.9, 'sawtooth', 4], [61.7, 'sine', 0], [82.9, 'triangle', -6], [58.3, 'sawtooth', 3]].forEach(a => {
      const o = c.createOscillator(); o.type = a[1]; o.frequency.value = a[0]; o.detune.value = a[2] * 5;
      const g = c.createGain(); g.gain.value = a[1] === 'sine' ? 0.35 : 0.12; o.connect(g); g.connect(lp); o.start(); this.droneOsc.push(o);
    });
    lp.connect(dg); dg.connect(this.dry);
    // wind
    const wn = this.noise(this.pinkBuf), wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 1.2;
    const wg = this.windG = c.createGain(); wg.gain.value = 0.09;
    const wl = c.createOscillator(), wlg = c.createGain(); wl.frequency.value = 0.11; wlg.gain.value = 260; wl.connect(wlg); wlg.connect(wf.frequency); wl.start();
    const wl2 = c.createOscillator(), wlg2 = c.createGain(); wl2.frequency.value = 0.23; wlg2.gain.value = 0.05; wl2.connect(wlg2); wlg2.connect(wg.gain); wl2.start();
    wn.connect(wf); wf.connect(wg); wg.connect(this.dry); wn.start();
    // high tension shimmer, rises with fear
    const sh = this.shimG = c.createGain(); sh.gain.value = 0;
    [1760, 1864.7, 2217].forEach(f => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(sh); o.start(); });
    sh.connect(this.dry);
    // chase pulse music
    const ch = this.chaseG = c.createGain(); ch.gain.value = 0;
    const co = c.createOscillator(); co.type = 'sawtooth'; co.frequency.value = 55;
    const co2 = c.createOscillator(); co2.type = 'square'; co2.frequency.value = 58.3;
    const cf = c.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 520; cf.Q.value = 6;
    const cam = c.createGain(); cam.gain.value = 0.5;
    const cl = c.createOscillator(), clg = c.createGain(); cl.type = 'square'; cl.frequency.value = 2.7; clg.gain.value = 0.5; cl.connect(clg); clg.connect(cam.gain);
    co.connect(cf); co2.connect(cf); cf.connect(cam); cam.connect(ch); co.start(); co2.start(); cl.start();
    ch.connect(this.dry);
    this.chaseLP = cf; this.chaseOsc = [co, co2];
    // heartbeat state
    this.hbT = 0; this.nextCreak = t + 6; this.nextWhisper = t + 14; this.nextKnock = t + 25;
  }
  /* continuous update */
  update(dt, st) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, fear = st.fear, ch = st.chase;
    this.droneG.gain.setTargetAtTime(0.17 + fear * 0.2, t, 0.5);
    this.droneLP.frequency.setTargetAtTime(160 + fear * 380, t, 0.6);
    this.shimG.gain.setTargetAtTime(fear * fear * 0.35, t, 0.3);
    this.chaseG.gain.setTargetAtTime(ch * 0.3, t, 0.25);
    this.chaseLP.frequency.setTargetAtTime(380 + fear * 900, t, 0.3);
    this.windG.gain.setTargetAtTime(st.outside ? 0.22 : 0.07 + 0.02 * Math.sin(t * 0.3), t, 0.8);
    // heartbeat
    const bpm = 55 + fear * 110 + (st.sprint ? 18 : 0);
    this.hbT -= dt;
    if (this.hbT <= 0 && (fear > 0.12 || st.hiding)) {
      this.hbT = 60 / bpm;
      const vol = 0.18 + fear * 0.55;
      this.thump(t, 54, vol); this.thump(t + 0.17, 46, vol * 0.75);
    }
    if (t > this.nextCreak) { this.nextCreak = t + 5 + Math.random() * 11; this.creak(0.12 + Math.random() * 0.1, 140 + Math.random() * 160, st.pan); }
    if (t > this.nextWhisper && fear > 0.08) { this.nextWhisper = t + 7 + Math.random() * 14; this.whisper(); }
    if (t > this.nextKnock) { this.nextKnock = t + 22 + Math.random() * 30; this.knock(); }
  }
  thump(t, f, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.14);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.25);
  }
  creak(vol, f, pan) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f2 = c.createBiquadFilter(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.type = 'sawtooth'; const d = 0.5 + Math.random() * 0.9;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.8), t + d * 0.5); o.frequency.linearRampToValueAtTime(f * (0.9 + Math.random() * 0.5), t + d);
    f2.type = 'bandpass'; f2.frequency.value = f * 4; f2.Q.value = 9;
    const fm = c.createOscillator(), fg = c.createGain(); fm.frequency.value = 32 + Math.random() * 30; fg.gain.value = f * 0.6; fm.connect(fg); fg.connect(o.frequency); fm.start(t); fm.stop(t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + d * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + d);
    o.connect(f2); f2.connect(g);
    if (p) { p.pan.value = (Math.random() * 2 - 1) * 0.8; g.connect(p); p.connect(this.dry); } else g.connect(this.dry);
    o.start(t); o.stop(t + d + 0.05);
  }
  whisper() {
    const c = this.ctx, t = c.currentTime, n = this.noise(this.pinkBuf), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 4; f.frequency.value = 1200;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    const dur = 1.8 + Math.random() * 1.6;
    for (let i = 0; i < 8; i++) f.frequency.linearRampToValueAtTime(700 + Math.random() * 1700, t + i * dur / 8);
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 9; i++) g.gain.linearRampToValueAtTime(Math.random() < 0.35 ? 0.03 : 0.4 + Math.random() * 0.4, t + i * dur / 9);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g);
    if (p) { p.pan.setValueAtTime(-0.8 + Math.random() * 1.6, t); p.pan.linearRampToValueAtTime(-0.8 + Math.random() * 1.6, t + dur); g.connect(p); p.connect(this.dry); } else g.connect(this.dry);
    n.start(t, Math.random()); n.stop(t + dur + 0.1);
  }
  knock() {
    const c = this.ctx, t = c.currentTime;
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) this.hit(t + i * (0.22 + Math.random() * 0.12), 120, 0.55);
  }
  hit(t, f, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), nb = this.noise(), nf = c.createBiquadFilter(), ng = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.1);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    nf.type = 'lowpass'; nf.frequency.value = 900; ng.gain.setValueAtTime(vol * 0.7, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(this.dry); nb.connect(nf); nf.connect(ng); ng.connect(this.dry);
    o.start(t); o.stop(t + 0.25); nb.start(t); nb.stop(t + 0.1);
  }
  /* one-shots */
  step(surface, sprint, crouch) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, v = (sprint ? 1 : crouch ? 0.28 : 0.6) * (0.85 + Math.random() * 0.3);
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    let ff = 600, q = 1, dur = 0.12, vol = 0.5, lowth = 0;
    switch (surface) {
      case 'wood': ff = 520; q = 1.6; dur = 0.15; vol = 0.65; lowth = 95; break;
      case 'tile': ff = 2300; q = 2.2; dur = 0.1; vol = 0.5; lowth = 140; break;
      case 'stone': ff = 1100; q = 1.3; dur = 0.13; vol = 0.55; lowth = 80; break;
      case 'carpet': ff = 300; q = 0.7; dur = 0.1; vol = 0.3; lowth = 60; break;
      case 'grass': ff = 420; q = 0.6; dur = 0.12; vol = 0.3; lowth = 55; break;
      default: ff = 700; q = 1; dur = 0.12; vol = 0.4; lowth = 90;
    }
    f.type = 'bandpass'; f.frequency.value = ff * (0.9 + Math.random() * 0.25); f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.dry); n.start(t, Math.random()); n.stop(t + dur + 0.05);
    // body thud
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(lowth * 1.4, t); o.frequency.exponentialRampToValueAtTime(lowth * 0.6, t + 0.09);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vol * v * 0.9, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); og.connect(this.dry); o.start(t); o.stop(t + 0.15);
    if (surface === 'wood' && Math.random() < 0.18) this.creak(0.07, 180 + Math.random() * 120);
  }
  // positioned entity footstep (distance based gain + pan)
  entStep(dist, pan, heavy) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, att = 1 / (1 + dist * 0.28), vol = Math.min(1.4, att * (heavy ? 2.2 : 1.6));
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.18);
    lp.type = 'lowpass'; lp.frequency.value = 400 + 1400 * att;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(lp); lp.connect(g);
    const n = this.noise(), nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'lowpass'; nf.frequency.value = 700 * (0.4 + att);
    ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); n.connect(nf); nf.connect(ng);
    if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); ng.connect(p); p.connect(this.dry); } else { g.connect(this.dry); ng.connect(this.dry); }
    o.start(t); o.stop(t + 0.35); n.start(t); n.stop(t + 0.15);
    if (dist < 14 && Math.random() < 0.5) {
      // dragging claw scratch
      const sn = this.noise(), sf = c.createBiquadFilter(), sg = c.createGain(); sf.type = 'highpass'; sf.frequency.value = 2800;
      sg.gain.setValueAtTime(0.0001, t + 0.05); sg.gain.linearRampToValueAtTime(att * 0.18, t + 0.12); sg.gain.linearRampToValueAtTime(0.0001, t + 0.34);
      sn.connect(sf); sf.connect(sg); if (p) { sg.connect(p); } else sg.connect(this.dry); sn.start(t, Math.random()); sn.stop(t + 0.4);
    }
  }
  // entity "appears" stinger: screech + sub-boom + reverse swell
  stinger(big) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.6); o.frequency.exponentialRampToValueAtTime(700, t + 1.4);
    o2.frequency.setValueAtTime(394, t); o2.frequency.exponentialRampToValueAtTime(1580, t + 0.6); o2.frequency.exponentialRampToValueAtTime(740, t + 1.4);
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(big ? 0.55 : 0.32, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 2.2 : 1.5));
    o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(this.dry);
    o.start(t); o2.start(t); o.stop(t + 2.4); o2.stop(t + 2.4);
    const sb = c.createOscillator(), sg = c.createGain(); sb.type = 'sine'; sb.frequency.setValueAtTime(90, t); sb.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(big ? 1.3 : 0.8, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    sb.connect(sg); sg.connect(this.master); sb.start(t); sb.stop(t + 2);
    const n = this.noise(), nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'lowpass'; nf.frequency.setValueAtTime(7000, t); nf.frequency.exponentialRampToValueAtTime(300, t + 1.6);
    ng.gain.setValueAtTime(big ? 0.9 : 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); n.connect(nf); nf.connect(ng); ng.connect(this.dry); n.start(t); n.stop(t + 2);
  }
  scream() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let k = 0; k < 4; k++) {
      const o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
      o.type = 'sawtooth'; const f0 = 520 * (1 + k * 0.5);
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.9, t + 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.6);
      const lf = c.createOscillator(), lg = c.createGain(); lf.frequency.value = 19 + k * 5; lg.gain.value = f0 * 0.2; lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + 2);
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
      o.connect(bp); bp.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 2.1);
    }
    this.thump(t, 40, 1.2);
  }
  growl() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(52, t); o.frequency.linearRampToValueAtTime(38, t + 2);
    const lf = c.createOscillator(), lg = c.createGain(); lf.frequency.value = 24; lg.gain.value = 22; lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + 2.2);
    lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 2.1);
    o.connect(lp); lp.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 2.2);
  }
  click(on) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(on ? 2600 : 1800, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.06);
  }
  /* gunshot: noise crack + low boom (bigger for the sniper) */
  shot(big) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(big ? 5000 : 7000, t); f.frequency.exponentialRampToValueAtTime(big ? 300 : 500, t + (big ? 0.5 : 0.25));
    g.gain.setValueAtTime(big ? 1.1 : 0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.9 : 0.4));
    n.connect(f); f.connect(g); g.connect(this.dry); n.start(t, Math.random()); n.stop(t + 1);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(big ? 120 : 160, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    og.gain.setValueAtTime(big ? 1.2 : 0.8, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.4);
    if (big) { this.hit(t + 0.7, 600, 0.12); this.hit(t + 0.85, 420, 0.12); }
  }
  dryfire() { if (!this.ok) return; const t = this.ctx.currentTime; this.hit(t, 900, 0.12); }
  pickup() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.04); g.gain.linearRampToValueAtTime(0.0001, t + 0.28);
    n.connect(f); f.connect(g); g.connect(this.dry); n.start(t, Math.random()); n.stop(t + 0.3);
    [523.25, 659.25, 783.99].forEach((fr, i) => { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = fr * 0.5; og.gain.setValueAtTime(0.0001, t + 0.08 + i * 0.07); og.gain.linearRampToValueAtTime(0.12, t + 0.1 + i * 0.07); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); o.connect(og); og.connect(this.dry); o.start(t + 0.08 + i * 0.07); o.stop(t + 1.5); });
  }
  doorCreak(open) { if (!this.ok) return; this.creak(0.22, open ? 90 : 120, 0); const t = this.ctx.currentTime; this.hit(t + (open ? 0 : 0.55), 70, 0.4); }
  locked() { if (!this.ok) return; const t = this.ctx.currentTime; this.hit(t, 180, 0.4); this.hit(t + 0.12, 150, 0.35); }
  breath(t0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(this.pinkBuf), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.35); g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    n.connect(f); f.connect(g); g.connect(this.dry); n.start(t, Math.random()); n.stop(t + 1);
  }
  hide(on) { if (!this.ok) return; const t = this.ctx.currentTime; this.hit(t, 110, 0.35); this.creak(0.1, 160); }
  win() {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.18); g.gain.linearRampToValueAtTime(0.18, t + i * 0.18 + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 4); o.connect(g); g.connect(this.dry); o.start(t + i * 0.18); o.stop(t + 4.2); });
  }
  duck(on) { if (!this.ok) return; this.master.gain.setTargetAtTime(on ? 0.0 : 1, this.ctx.currentTime, 0.1); }
}

/* ============ GAME: state, input, physics, AI, render loop ============ */
const NEED = 7;
const NOTES = [
  'اليوم الأول: سمعنا خطوات في الطابق العلوي. لا يوجد طابق علوي في هذا البيت.',
  'لا تنظر إليه مباشرة حين يقف في آخر الممر. هو لا يتحرك ما دمت تراه... هكذا كنت أظن.',
  'الشموع تخفت قبل أن يصل. إن خفتت فاختبئ فوراً.',
  'سمعته يتنفس خلف خزانة غرفة النوم طوال الليل. لم أجرؤ على فتحها.',
  'كل الأبواب تُغلق وحدها. إلا باب المصلّى، يبقى مفتوحاً دائماً... ينتظرنا.',
  'المصباح يحميك قليلاً. الظلام هو بيته، والضوء ضيف غير مرحّب به.',
  'لا تركض إلا عند الضرورة. صوت أقدامك يصل إليه قبل أن تراه.',
  'وجدت المفتاح في المطبخ. المكتبة تخفي أكثر مما تُظهر.',
  'أحصيت الأوراق: كلها بخطي، ولا أذكر أنني كتبتها.',
  'إن قرأت هذه الورقة فهو يعرف أين أنت الآن.'
];
const ITN = { pistol: 'المسدس', sniper: 'القنّاصة', ammoP: 'طلقات المسدس', ammoS: 'طلقات القنّاصة' };
const G = {
  state: 'loading', t: 0, pages: 0, hasKey: false, flashOn: true, flashI: 1, flashPh: 0,
  p: { x: 42, z: 100, vx: 0, vz: 0, yaw: 0, pitch: 0, stam: 1, bob: 0, stride: 0, hiding: -1, speed: 0, roll: 0 },
  e: null, fear: 0, chaseAmt: 0, hit: 0, glitch: 0, pulse: 0, fade: 0, white: 0, lastSeen: 99, everSeen: false,
  keys: {}, joy: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, touchSprint: false, touchAct: false,
  settings: { q: 'low', sens: 2.4, vol: 1 }, msg: [], noteT: 0, deadT: 0, winT: 0, runT: 0, prompt: '', nextApp: 40,
  inv: { pistol: false, sniper: false, ammoP: 0, ammoS: 0, cur: 'none' },
  cool: 0, recoil: 0, muzzle: 0, aim: false, aimK: 0, mouseFire: false, touchFire: false, outA: 1, zone: null, hudT: 0, sqWarn: false
};
const $ = id => document.getElementById(id);
let R, MAT, W, SND, canvas, MESH = {}, PART = {}, DOORM = {}, mapTex, mapData, tUnits = {};
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

/* ---------- dynamic meshes ---------- */
function buildDynMeshes() {
  const m = (fn) => { const b = new MB(); fn(b); return R.mesh(b); };
  MESH.flame = m(b => b.sphere(0, 0, 0, 0.026, 0.06, 0.026, 8, [1, 1, 1]));
  MESH.shade = m(b => { b.cyl(0, -0.1, 0, 0.17, 0.11, 0.22, 12, [1, 1, 1], false); });
  MESH.lamp = m(b => b.sphere(0, 0, 0, 0.18, 0.26, 0.18, 8, [1, 1, 1]));
  MESH.flash = m(b => b.sphere(0, 0, 0, 0.07, 0.07, 0.07, 8, [1, 1, 1]));
  MESH.beacon = m(b => b.cyl(0, 0, 0, 0.25, 0.25, 70, 8, [1, 1, 1], false));
  MESH.fire = m(b => { b.sphere(0, 0.15, 0, 0.62, 0.34, 0.07, 10, [1, 1, 1]); b.sphere(-0.3, 0.1, 0, 0.18, 0.4, 0.07, 8, [1, 1, 1]); b.sphere(0.25, 0.1, 0, 0.2, 0.34, 0.07, 8, [1, 1, 1]); });
  MESH.page = m(b => b.box(0, 0, 0, 0.3, 0.012, 0.4, [1, 1, 1], 0, 1));
  MESH.key = m(b => { b.box(0, 0, 0, 0.16, 0.025, 0.04, [1, 1, 1], 0, 0.5); b.cyl(-0.1, -0.012, 0, 0.05, 0.05, 0.025, 10, [1, 1, 1], true, 0.5); b.box(0.06, 0, 0.03, 0.025, 0.025, 0.05, [1, 1, 1], 0, 0.5); b.box(0.035, 0, 0.03, 0.025, 0.025, 0.05, [1, 1, 1], 0, 0.5); });
  MESH.sign = m(b => b.box(0, 0, 0, 1.6, 0.22, 0.05, [1, 1, 1], 0, 0.5));
  // weapons (barrel points along local -z)
  MESH.pistolV = m(b => {
    const st = [0.1, 0.1, 0.12], gr = [0.07, 0.05, 0.04];
    b.box(0, 0.0, -0.1, 0.045, 0.055, 0.26, st, 0, 0.5);
    b.box(0, -0.045, -0.04, 0.035, 0.04, 0.14, st, 0, 0.5);
    b.box(0, -0.1, 0.03, 0.04, 0.12, 0.055, gr, 0, 0.5);
    b.box(0, 0.032, -0.2, 0.01, 0.012, 0.02, [0.8, 0.8, 0.8], 0, 0.5);
  });
  MESH.sniperV = m(b => {
    const st = [0.1, 0.1, 0.12], wd = [0.22, 0.14, 0.08];
    b.box(0, 0, -0.55, 0.03, 0.03, 0.95, st, 0, 0.5);
    b.box(0, -0.01, -0.05, 0.055, 0.085, 0.5, st, 0, 0.5);
    b.box(0, -0.06, 0.38, 0.05, 0.12, 0.34, wd, 0, 0.5);
    b.box(0, 0.07, -0.2, 0.04, 0.045, 0.3, [0.05, 0.05, 0.06], 0, 0.5);
    b.box(0, 0.07, -0.37, 0.052, 0.052, 0.03, [0.03, 0.03, 0.04], 0, 0.5);
    b.box(0, -0.085, -0.02, 0.03, 0.09, 0.05, wd, 0, 0.5);
  });
  MESH.ammo = m(b => { b.box(0, 0, 0, 0.16, 0.07, 0.1, [0.75, 0.55, 0.2], 0, 0.5); b.box(0, 0.045, 0, 0.17, 0.02, 0.11, [0.5, 0.35, 0.12], 0, 0.5); });
  const black = [0.02, 0.02, 0.02];
  // entity parts: featureless black child shadow
  PART.torso = m(b => { b.sphere(0, 0.38, 0, 0.18, 0.42, 0.11, 12, black); b.cyl(0, 0.72, 0, 0.055, 0.045, 0.14, 8, black, false); });
  PART.head = m(b => {
    b.sphere(0, 0.2, 0, 0.11, 0.16, 0.11, 14, black);
  });
  PART.eyes = m(b => { /* no features */ });
  PART.thigh = m(b => b.cyl(0, -0.48, 0, 0.032, 0.06, 0.48, 8, black, false));
  PART.shin = m(b => { b.cyl(0, -0.5, 0, 0.024, 0.038, 0.5, 8, black, false); });
  PART.uarm = m(b => b.cyl(0, -0.52, 0, 0.024, 0.042, 0.52, 8, black, false));
  PART.larm = m(b => { b.cyl(0, -0.58, 0, 0.016, 0.03, 0.58, 8, black, false); });
  // doors
  // fancy doors with lower squares and upper tall panels
  DOORM.y = m(b => {
    b.box(0.98, 1.35, 0, 1.96, 2.7, 0.08, [0.7, 0.5, 0.38], 0, 0.5); // main slab
    // lower square panels
    b.box(0.55, 0.55, 0.02, 0.55, 0.7, 0.03, [0.55, 0.38, 0.28], 0, 0.5);
    b.box(1.4, 0.55, 0.02, 0.55, 0.7, 0.03, [0.55, 0.38, 0.28], 0, 0.5);
    // upper tall rectangles
    b.box(0.55, 1.85, 0.02, 0.55, 1.1, 0.03, [0.55, 0.38, 0.28], 0, 0.5);
    b.box(1.4, 1.85, 0.02, 0.55, 1.1, 0.03, [0.55, 0.38, 0.28], 0, 0.5);
  });
  DOORM.x = m(b => {
    b.box(0, 1.35, 0.98, 0.08, 2.7, 1.96, [0.7, 0.5, 0.38], 0, 0.5);
    b.box(0.02, 0.55, 0.55, 0.03, 0.7, 0.55, [0.55, 0.38, 0.28], 0, 0.5);
    b.box(0.02, 0.55, 1.4, 0.03, 0.7, 0.55, [0.55, 0.38, 0.28], 0, 0.5);
    b.box(0.02, 1.85, 0.55, 0.03, 1.1, 0.55, [0.55, 0.38, 0.28], 0, 0.5);
    b.box(0.02, 1.85, 1.4, 0.03, 1.1, 0.55, [0.55, 0.38, 0.28], 0, 0.5);
  });
  DOORM.ex = m(b => {
    b.box(0.98, 1.35, 0, 1.96, 2.7, 0.1, [0.85, 0.6, 0.45], 0, 0.5);
    b.box(0.55, 0.55, 0.025, 0.55, 0.7, 0.03, [0.65, 0.45, 0.32], 0, 0.5);
    b.box(1.4, 0.55, 0.025, 0.55, 0.7, 0.03, [0.65, 0.45, 0.32], 0, 0.5);
    b.box(0.55, 1.85, 0.025, 0.55, 1.1, 0.03, [0.65, 0.45, 0.32], 0, 0.5);
    b.box(1.4, 1.85, 0.025, 0.55, 1.1, 0.03, [0.65, 0.45, 0.32], 0, 0.5);
  });
}

/* ---------- map helpers ---------- */
const cellOf = v => Math.floor(v / CS);
function doorBlocks(d) { return d.open < 0.55; }
function solidAtCell(i, j) {
  if (i < 0 || j < 0 || i >= MW || j >= MH) return false; // outside the house footprint is open air
  if (W.solid[cellIdx(i, j)]) return true;
  const di = W.doorAt[cellIdx(i, j)];
  if (di >= 0 && doorBlocks(W.doors[di])) return true;
  return false;
}
function circleHitsBox(x, z, r, b) {
  const cx = clamp(x, b[0], b[2]), cz = clamp(z, b[1], b[3]);
  const dx = x - cx, dz = z - cz; return dx * dx + dz * dz < r * r;
}
function blockedAt(x, z, r, props) {
  const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (solidAtCell(i, j) && circleHitsBox(x, z, r, [i * CS, j * CS, (i + 1) * CS, (j + 1) * CS])) return true;
  }
  if (props) for (const b of W.cols) if (circleHitsBox(x, z, r, b)) return true;
  return false;
}
function moveBody(o, dx, dz, r, props) {
  if (!blockedAt(o.x + dx, o.z, r, props)) o.x += dx;
  if (!blockedAt(o.x, o.z + dz, r, props)) o.z += dz;
}
function los(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.5);
  for (let k = 1; k < n; k++) { const t = k / n; if (solidAtCell(cellOf(ax + dx * t), cellOf(az + dz * t))) return false; }
  return true;
}
function walkable(i, j) {
  if (i < 0 || j < 0 || i >= MW || j >= MH || W.solid[cellIdx(i, j)]) return false;
  const di = W.doorAt[cellIdx(i, j)];
  if (di >= 0 && W.doors[di].locked) return false;
  return true;
}
const BFS = { prev: new Int32Array(MW * MH), q: new Int32Array(MW * MH) };
function findPath(sx, sz, tx, tz) {
  const s = cellIdx(cellOf(sx), cellOf(sz)); let t = cellIdx(cellOf(tx), cellOf(tz));
  if (!walkable(cellOf(tx), cellOf(tz))) return null;
  BFS.prev.fill(-1); BFS.prev[s] = s; let h = 0, tl = 0; BFS.q[tl++] = s;
  while (h < tl) {
    const c = BFS.q[h++]; if (c === t) break;
    const ci = c % MW, cj = (c / MW) | 0;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + d[0], nj = cj + d[1];
      if (!walkable(ni, nj)) continue;
      const n = cellIdx(ni, nj); if (BFS.prev[n] >= 0) continue;
      BFS.prev[n] = c; BFS.q[tl++] = n;
    }
  }
  if (BFS.prev[t] < 0) return null;
  const path = []; let c = t;
  while (c !== s) { path.push([(c % MW) * CS + 1, ((c / MW) | 0) * CS + 1]); c = BFS.prev[c]; }
  path.reverse(); return path;
}
const inGrid = (x, z) => x >= 0 && x < MW * CS && z >= 0 && z < MH * CS;
function outSurface(x, z) {
  if (z >= 106 && z <= 126) return 'stone';
  if (x >= 32 && x <= 52 && z >= 126) return 'stone';
  if (x >= 22 && x <= 62 && z >= 296 && z <= 344) return 'stone';
  if (x >= 40 && x <= 44 && z >= 64 && z <= 106) return 'stone';
  if (z >= 185 && z <= 195 && x > -130 && x < 210) return 'stone';
  if (z >= 245 && z <= 255 && x > -130 && x < 210) return 'stone';
  return 'grass';
}
function surfaceAt(x, z) {
  if (!inGrid(x, z)) return outSurface(x, z);
  const r = W.roomOf[cellIdx(cellOf(x), cellOf(z))];
  return r >= 0 ? ROOMS[r].floor : 'stone';
}
function roomAt(x, z) { return W.roomOf[cellIdx(clamp(cellOf(x), 0, MW - 1), clamp(cellOf(z), 0, MH - 1))]; }
function placeName(x, z) {
  if (inGrid(x, z)) { const r = roomAt(x, z); return r >= 0 ? ROOMS[r].name : null; }
  if (x > 22 && x < 62 && z > 296 && z < 344) return 'ساحة المدينة';
  if (x > FX0 && x < FX1 && z > FZ0 && z < FZ1) return 'الحديقة';
  if (z > 125 && x > -150 && x < 225 && z < 385) return 'المدينة';
  if (z > 100 && z < 128) return 'الشارع';
  return 'الغابة';
}

/* ---------- HUD helpers ---------- */
function say(text, ms) {
  const el = document.createElement('div'); el.className = 'msg'; el.textContent = text;
  $('msgs').appendChild(el); setTimeout(() => el.classList.add('out'), ms || 3200); setTimeout(() => el.remove(), (ms || 3200) + 900);
}

/* ---------- entity ---------- */
function newEntity() {
  const r = ROOMS[8];
  return { x: (r.x0 + r.x1 + 1), z: (r.y0 + r.y1 + 1), yaw: PI, state: 'wait', st: 0, path: null, pi: 0, repath: 0, last: null, walk: 0, stride: 0, vis: false, visT: 0, speed: 0,
    stateT: 0, tgtRoom: -1, sawEnter: false, checking: 0, appear: 0, stun: 0, huntTimer: 30, lean: 0, head: 0, twitch: 0, ghost: 0, hp: 100, wakeT: 0 };
}
function entSpeed() {
  const f = G.pages / NEED;
  return { patrol: 1.55 + f * 0.55, chase: 3.45 + f * 0.7 };
}
function setPath(e, tx, tz) {
  if (!walkable(cellOf(tx), cellOf(tz))) { tx = 41; tz = 63; } // target outside the house: wait at the doorstep
  e.path = findPath(e.x, e.z, tx, tz); e.pi = 0;
}
function entGoRoom(e, id) {
  const r = ROOMS[id]; e.tgtRoom = id;
  const tx = (r.x0 + r.x1 + 1) + (Math.random() - 0.5) * 6, tz = (r.y0 + r.y1 + 1) + (Math.random() - 0.5) * 6;
  setPath(e, clamp(Math.floor(tx / CS) * CS + 1, r.x0 * CS + 1, r.x1 * CS + 1), clamp(Math.floor(tz / CS) * CS + 1, r.y0 * CS + 1, r.y1 * CS + 1));
}
function entSetState(e, s) { e.state = s; e.stateT = 0; }
function killEntity() {
  const e = G.e, r = ROOMS[8];
  e.state = 'wait'; e.wakeT = 40 + Math.random() * 20; e.hp = 100; e.stun = 0; e.path = null; e.speed = 0; e.vis = false;
  e.x = r.x0 + r.x1 + 1; e.z = r.y0 + r.y1 + 1;
  SND.stinger(false); G.glitch = 1;
  say('...الظل تلاشى. لكنه سيعود', 3800);
}
function updateEntity(dt) {
  const e = G.e, p = G.p; if (!e) return;
  e.stateT += dt;
  if (e.stun > 0) { e.stun -= dt; e.twitch = (Math.random() - 0.5) * 3; }
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
  const sp = entSpeed();
  const hiding = p.hiding >= 0;
  // sight
  let canSee = false;
  const fwx = Math.sin(e.yaw), fwz = Math.cos(e.yaw);
  if (dist < 22 && los(e.x, e.z, p.x, p.z)) {
    const cosA = (dx * fwx + dz * fwz) / (dist || 1);
    const range = G.flashOn ? 17 : 11;
    if (!hiding && ((dist < 3.4) || (dist < range && cosA > 0.35) || (p.speed > 3.9 && dist < 14))) canSee = true;
    if (hiding && G.p.sawEnter && dist < 12 && cosA > 0.2) canSee = true; // saw you slip in
  }
  const prevState = e.state;
  switch (e.state) {
    case 'wait':
      if (e.wakeT > 0) {
        e.wakeT -= dt;
        if (e.wakeT <= 0) { e.hp = 100; entGoRoom(e, 5); entSetState(e, 'patrol'); }
        break;
      }
      if (G.t > 18 && !hiding) { entGoRoom(e, 5); entSetState(e, 'patrol'); }
      break;
    case 'patrol': {
      if (canSee && !hiding) { entSetState(e, 'chase'); break; }
      if (!e.path || e.pi >= e.path.length) { e.speed = 0; if (e.stateT > 2.6 + Math.random() * 2) { pickPatrol(e); e.stateT = 0; } }
      e.huntTimer -= dt;
      if (e.huntTimer <= 0) { e.huntTimer = 24 + Math.random() * 18; setPath(e, p.x, p.z); entSetState(e, 'hunt'); }
      break;
    }
    case 'hunt':
      if (canSee && !hiding) { entSetState(e, 'chase'); break; }
      if (e.path && e.pi >= e.path.length) { entSetState(e, 'search'); e.checking = 0; }
      if (e.stateT > 30) { pickPatrol(e); entSetState(e, 'patrol'); }
      break;
    case 'chase': {
      if (canSee) { e.last = [p.x, p.z]; e.lostT = 0; } else e.lostT = (e.lostT || 0) + dt;
      e.repath -= dt;
      if (e.repath <= 0 && e.last) { e.repath = 0.28; setPath(e, canSee ? p.x : e.last[0], canSee ? p.z : e.last[1]); }
      if (dist < 1.15 && !hiding && e.stun <= 0) { catchPlayer(); break; }
      if (e.lostT > 3.8) { entSetState(e, 'search'); e.checking = 0; }
      break;
    }
    case 'search': {
      if (canSee && !hiding) { entSetState(e, 'chase'); break; }
      if (!e.path || e.pi >= e.path.length) {
        e.speed = 0;
        if (hiding && dist < 3.2) {
          e.checking += dt;
          if (e.checking > 2.2 && !e.decided) { e.decided = true; e.found = G.p.sawEnter || Math.random() < 0.3; }
          if (e.decided && e.found && e.checking > 3.4) { catchPlayer(true); }
          if (e.decided && !e.found && e.checking > 5.2) { e.decided = false; pickPatrol(e); entSetState(e, 'patrol'); }
        } else if (e.stateT > 5.5 + Math.random() * 2) { e.decided = false; pickPatrol(e); entSetState(e, 'patrol'); }
        else {
          // look around
          e.twitch = Math.sin(G.t * 0.9) * 1.1;
        }
      }
      if (e.stateT > 1.2 && e.last && !e.path) { setPath(e, e.last[0], e.last[1]); }
      if (hiding && e.stateT > 1 && e.state === 'search' && e.path === null && e.last) setPath(e, e.last[0], e.last[1]);
      break;
    }
    case 'dead': return;
  }
  if (e.state !== prevState) {
    if (e.state === 'chase') {
      e.last = [p.x, p.z]; e.lostT = 0; e.repath = 0;
      SND.stinger(true); SND.growl(); G.glitch = 1; G.pulse = 1;
      say('إنه يطاردك! اهرب أو اختبئ!', 2600);
    }
    if (e.state === 'hunt') SND.growl();
    if (e.state === 'search' && prevState === 'chase') e.decided = false;
  }
  // move along path
  let moveSp = 0;
  if (e.state === 'patrol') moveSp = sp.patrol; else if (e.state === 'hunt') moveSp = sp.patrol * 1.35;
  else if (e.state === 'chase') moveSp = sp.chase; else if (e.state === 'search') moveSp = sp.patrol * 1.1;
  if (e.stun > 0) moveSp = 0;
  if (e.path && e.pi < e.path.length && moveSp > 0) {
    const tgt = e.path[e.pi], tdx = tgt[0] - e.x, tdz = tgt[1] - e.z, td = Math.hypot(tdx, tdz);
    if (td < 0.4) e.pi++;
    else {
      const ty = Math.atan2(tdx, tdz); let dy = ty - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, dt * (e.state === 'chase' ? 9 : 4.5));
      const mv = moveSp * dt;
      const ex = e.x + (tdx / td) * mv, ez = e.z + (tdz / td) * mv;
      e.x = ex; e.z = ez; e.speed = moveSp;
    }
  } else e.speed = 0;
  if (e.state === 'chase' && canSee && dist < 5) { const ty = Math.atan2(dx, dz); let dy = ty - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 8); }
  // doors open for entity
  // stride + sound
  e.stride += e.speed * dt;
  const stp = e.state === 'chase' ? 1.8 : 1.4;
  if (e.stride > stp) {
    e.stride = 0;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const pan = dist > 0.1 ? (dx * rx + dz * rz) / dist : 0;
    SND.entStep(dist, pan, e.state === 'chase');
  }
  e.walk += e.speed * dt * 1.55;
  e.lean = damp(e.lean, e.state === 'chase' ? 0.38 : e.state === 'hunt' ? 0.18 : 0.04, 4, dt);
  // visibility to player (for sighting stinger)
  const cf = [-Math.sin(p.yaw) * Math.cos(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
  const toE = [e.x - p.x, e.z - p.z], dd = Math.hypot(toE[0], toE[1]) || 1;
  const inView = e.state !== 'wait' && (toE[0] * cf[0] + toE[1] * cf[1]) / dd > 0.62 && los(p.x, p.z, e.x, e.z) && dd < 24 && (G.flashOn || dd < 9);
  if (inView && !e.vis) {
    if (G.lastSeen > 14 && e.state !== 'chase') { SND.stinger(false); G.glitch = Math.max(G.glitch, 0.8); if (!G.everSeen) say('...هناك شيء يقف في الظلام', 3200); G.everSeen = true; }
  }
  e.vis = inView; if (inView) G.lastSeen = 0; else G.lastSeen += dt;
  e.dist = dist; e.los = los(e.x, e.z, p.x, p.z);
}
function pickPatrol(e) {
  const here = roomAt(e.x, e.z), pr = roomAt(G.p.x, G.p.z);
  let id; let tries = 0;
  do { id = (Math.random() * ROOMS.length) | 0; tries++; } while ((id === here || (id === pr && Math.random() < 0.55)) && tries < 12);
  entGoRoom(e, id);
}
function catchPlayer(fromHide) {
  const e = G.e; if (G.state !== 'play') return;
  G.state = 'dying'; G.deadT = 0; e.state = 'dead'; G.aim = false; G.mouseFire = false; G.touchFire = false;
  if (fromHide) { G.p.hiding = -1; }
  SND.scream(); G.hit = 1; G.glitch = 1;
}

/* ---------- weapons ---------- */
function refreshWeaponUI() {
  const I = G.inv, el = $('wep'), w = I.cur;
  if (w === 'none') el.classList.remove('on');
  else { el.textContent = (w === 'pistol' ? 'المسدس' : 'القنّاصة') + ' • ' + (w === 'pistol' ? I.ammoP : I.ammoS) + ' طلقة'; el.classList.add('on'); }
  document.body.classList.toggle('armed', w !== 'none');
  if (w === 'none') G.aim = false;
}
function equip(w) {
  const I = G.inv;
  if (w === 'none' || I.cur === w) I.cur = 'none';
  else if (I[w]) I.cur = w;
  else return;
  G.aim = false; SND.click(true); refreshWeaponUI();
}
function toggleFlash() { G.flashOn = !G.flashOn; SND.click(G.flashOn); }
function fire() {
  const I = G.inv, w = I.cur, p = G.p;
  if (w === 'none' || G.state !== 'play' || p.hiding >= 0 || G.cool > 0) return;
  const ak = w === 'pistol' ? 'ammoP' : 'ammoS', sn = w === 'sniper';
  if (I[ak] <= 0) { SND.dryfire(); G.cool = 0.4; say('لا توجد طلقات — ابحث عنها!', 1800); return; }
  I[ak]--;
  G.cool = sn ? 1.4 : 0.3; G.recoil = sn ? 2.4 : 1; G.muzzle = 0.07;
  SND.shot(sn); refreshWeaponUI();
  const eye = G.camPos, spread = (sn && G.aimK > 0.8) ? 0 : (sn ? 0.02 : 0.012);
  const yaw = p.yaw + (Math.random() - 0.5) * spread, pit = p.pitch + (Math.random() - 0.5) * spread;
  const d = [-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
  const e = G.e;
  if (!e || e.state === 'wait' || e.state === 'dead') return;
  // the noise draws it to you
  if (e.state !== 'chase') { e.last = [p.x, p.z]; setPath(e, p.x, p.z); entSetState(e, 'hunt'); }
  let best = null;
  for (const hp of [[0.5, 1], [1.1, 1], [1.7, 1], [2.35, 2]]) {
    const px = e.x - eye[0], py = hp[0] - eye[1], pz = e.z - eye[2];
    const tt = px * d[0] + py * d[1] + pz * d[2]; if (tt < 0.3 || tt > 90) continue;
    const cx = px - d[0] * tt, cy = py - d[1] * tt, cz = pz - d[2] * tt, dd = Math.hypot(cx, cy, cz);
    if (dd < (hp[1] > 1 ? 0.22 : 0.34) && (!best || tt < best.t)) best = { t: tt, m: hp[1] };
  }
  if (best && los(eye[0], eye[2], e.x, e.z)) {
    e.hp -= (sn ? 70 : 20) * best.m;
    e.stun = Math.max(e.stun, (sn ? 3 : 1.1) * (best.m > 1 ? 1.4 : 1));
    G.glitch = Math.max(G.glitch, 0.5); G.pulse = 0.6;
    const dot = $('dot'); dot.classList.add('hit'); setTimeout(() => dot.classList.remove('hit'), 140);
    if (e.hp <= 0) killEntity();
    else if (e.state !== 'chase') { entSetState(e, 'chase'); e.last = [p.x, p.z]; e.lostT = 0; e.repath = 0; SND.growl(); say('أصبتَه — لكنه غاضب!', 1800); }
  }
}

/* ---------- inventory ---------- */
function renderInv() {
  const I = G.inv, box = $('slots'); box.textContent = '';
  const rows = [
    { n: 'المصباح', c: G.flashOn ? 'مشتعل' : 'مطفأ', on: true, b: 'تبديل (R)', f: () => { if (G.p.hiding < 0) toggleFlash(); } },
    { n: 'المسدس (فرد)', c: I.pistol ? ('الطلقات: ' + I.ammoP) : 'لم تجده بعد', on: I.pistol, b: I.cur === 'pistol' ? 'إخفاء (1)' : 'تجهيز (1)', f: () => equip('pistol') },
    { n: 'القنّاصة', c: I.sniper ? ('الطلقات: ' + I.ammoS) : 'لم تجدها بعد', on: I.sniper, b: I.cur === 'sniper' ? 'إخفاء (2)' : 'تجهيز (2)', f: () => equip('sniper') },
    { n: 'الأوراق', c: G.pages + ' / ' + NEED, on: G.pages > 0 },
    { n: 'المفتاح القديم', c: G.hasKey ? 'معك' : 'لم تجده بعد', on: G.hasKey },
    { n: 'الذخيرة', c: 'مسدس: ' + I.ammoP + '  •  قنّاص: ' + I.ammoS, on: (I.ammoP + I.ammoS) > 0 }
  ];
  rows.forEach(r => {
    const d = document.createElement('div'); d.className = 'slot' + (r.on ? '' : ' off');
    const a = document.createElement('span'); a.className = 'nm'; a.textContent = r.n;
    const b = document.createElement('span'); b.className = 'ct'; b.textContent = r.c;
    d.append(a, b);
    if (r.f && r.on) { const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn ghost'; bt.textContent = r.b; bt.addEventListener('click', () => { r.f(); renderInv(); }); d.append(bt); }
    box.append(d);
  });
}
function openInv() {
  if (G.state !== 'play') return;
  G.state = 'inv'; G.mouseFire = false; G.touchFire = false; G.aim = false;
  renderInv(); $('inv').classList.add('on'); document.body.classList.remove('playing');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInv() {
  if (G.state !== 'inv') return;
  G.state = 'play'; $('inv').classList.remove('on'); document.body.classList.add('playing');
  if (!isTouch) { try { canvas.requestPointerLock(); } catch (e) { } }
}

/* ---------- player update ---------- */
function updatePlayer(dt) {
  const p = G.p;
  // look
  const sens = 0.0022 * G.settings.sens * (1 - 0.65 * (G.aimK || 0));
  if (p.hiding < 0) {
    p.yaw -= G.look.dx * sens; p.pitch = clamp(p.pitch - G.look.dy * sens, -1.4, 1.4);
  } else {
    const h = W.hides[p.hiding], base = Math.atan2(-h.fx, -h.fz) + PI; // face outward
    const by = Math.atan2(h.fx, h.fz);
    p.yaw -= G.look.dx * sens * 0.6; const rel = Math.atan2(Math.sin(p.yaw - (by + PI)), Math.cos(p.yaw - (by + PI)));
    // yaw convention: forward = (-sin yaw, -cos yaw). facing out (fx,fz): yaw = atan2(-fx,-fz)
    const target = Math.atan2(-h.fx, -h.fz); let d = Math.atan2(Math.sin(p.yaw - target), Math.cos(p.yaw - target));
    d = clamp(d, -0.5, 0.5); p.yaw = target + d; p.pitch = clamp(p.pitch - G.look.dy * sens * 0.6, -0.35, 0.35);
  }
  G.look.dx = 0; G.look.dy = 0;
  // move input
  let ix = 0, iz = 0;
  const K = G.keys;
  if (K.KeyW || K.ArrowUp) iz += 1; if (K.KeyS || K.ArrowDown) iz -= 1;
  if (K.KeyD) ix += 1; if (K.KeyA) ix -= 1;
  ix += G.joy.x; iz += -G.joy.y;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const wantSprint = (K.ShiftLeft || K.ShiftRight || G.touchSprint) && il > 0.1;
  let sprint = true; // always fast, no stamina
  if (p.hiding >= 0) { ix = 0; iz = 0; sprint = false; }
  const spd = (G.aimK > 0.5 && G.inv.cur === 'sniper') ? 2.2 : 4.6;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const tvx = (fx * iz + rx * ix) * spd, tvz = (fz * iz + rz * ix) * spd;
  p.vx = damp(p.vx, tvx, 11, dt); p.vz = damp(p.vz, tvz, 11, dt);
  const sub = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vz) * dt / 0.12));
  for (let s = 0; s < sub; s++) moveBody(p, p.vx * dt / sub, p.vz * dt / sub, 0.3, true);
  p.speed = Math.hypot(p.vx, p.vz);
  // bob + steps
  p.bob += p.speed * dt * 2.3;
  p.stride += p.speed * dt;
  const stp = 1.55;
  if (p.stride > stp) { p.stride = 0; SND.step(surfaceAt(p.x, p.z), true, false); }
  p.sprinting = true;
  p.roll = damp(p.roll, -ix * 0.03, 6, dt);
}

/* ---------- doors ---------- */
function updateDoors(dt) {
  const p = G.p, e = G.e;
  for (const d of W.doors) {
    const cx = d.cx * CS + 1, cz = d.cy * CS + 1;
    const dp = Math.hypot(p.x - cx, p.z - cz), de = e && e.state !== 'wait' && e.state !== 'dead' ? Math.hypot(e.x - cx, e.z - cz) : 99;
    if (d.exit) {
      d.target = 1; // the front door is always open
    } else if (d.locked) {
      if (dp < 3.0) {
        if (G.hasKey) { d.locked = false; say('فتحتَ الباب بالمفتاح', 2600); SND.pickup(); }
        else if (!d.warned) { d.warned = true; say('هذا الباب مقفل... ابحث عن مفتاح', 3000); SND.locked(); }
      } else if (dp > 5) d.warned = false;
    }
    if (!d.exit && !d.locked) {
      const near = dp < 2.5 || de < 2.7;
      const was = d.target; d.target = near ? 1 : (dp > 4.2 && de > 4.2 ? 0 : d.target);
      if (was !== d.target && dp < 16) { SND.doorCreak(!!d.target); }
    }
    const sp = d.exit ? 1.2 : 0.9;
    d.open = clamp(d.open + Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * sp), 0, 1);
  }
}

/* ---------- interactions ---------- */
function updateInteract(dt) {
  const p = G.p; let best = null, bd = 99, prompt = '';
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  if (p.hiding >= 0) { prompt = 'F — الخروج من مكان الاختباء'; best = { type: 'unhide' }; }
  else {
    for (const pg of W.pages) {
      if (pg.got) continue; const dx = pg.pos[0] - p.x, dz = pg.pos[2] - p.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && (d < 0.9 || (dx * fx + dz * fz) / d > 0.35) && d < bd) { bd = d; best = { type: 'page', o: pg }; prompt = 'F — التقاط الورقة'; }
    }
    for (const it of W.items) {
      if (it.got) continue; const dx = it.pos[0] - p.x, dz = it.pos[2] - p.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && (d < 0.9 || (dx * fx + dz * fz) / d > 0.35) && d < bd) { bd = d; best = { type: 'item', o: it }; prompt = 'F — التقاط ' + ITN[it.type]; }
    }
    const k = W.keyItem;
    if (k && !k.got) { const dx = k.pos[0] - p.x, dz = k.pos[2] - p.z, d = Math.hypot(dx, dz); if (d < 1.9 && (d < 0.9 || (dx * fx + dz * fz) / d > 0.35) && d < bd) { bd = d; best = { type: 'key' }; prompt = 'F — التقاط المفتاح'; } }
    W.hides.forEach((h, i) => {
      const dx = h.x + h.fx * 0.9 - p.x, dz = h.z + h.fz * 0.9 - p.z, d = Math.hypot(dx, dz);
      const tx = h.x - p.x, tz = h.z - p.z, td = Math.hypot(tx, tz);
      if (d < 1.4 && td < 1.9 && (tx * fx + tz * fz) / td > 0.45 && d + 0.4 < bd) { bd = d + 0.4; best = { type: 'hide', i }; prompt = 'F — الاختباء'; }
    });
  }
  if (prompt !== G.prompt) { G.prompt = prompt; const el = $('prompt'); el.textContent = prompt; el.classList.toggle('on', !!prompt); }
  const act = G.keys.KeyF || G.touchAct;
  if (act && !G.actHeld) {
    G.actHeld = true;
    if (best) doInteract(best);
  }
  if (!act) G.actHeld = false;
}
function doInteract(b) {
  const p = G.p;
  if (b.type === 'page') {
    b.o.got = true; G.pages++; SND.pickup();
    showNote(NOTES[(G.pages - 1) % NOTES.length]); updateHud();
    G.glitch = Math.max(G.glitch, 0.5);
    const e = G.e;
    if (e && e.state !== 'dead' && e.state !== 'chase' && e.state !== 'wait') { e.last = [p.x, p.z]; setPath(e, p.x, p.z); entSetState(e, 'hunt'); SND.growl(); }
    if (G.pages === NEED) say('جمعتَ كل الأوراق — اهرب إلى ساحة المدينة جنوباً!', 4500);
  } else if (b.type === 'item') {
    const it = b.o, I = G.inv; it.got = true; SND.pickup();
    if (it.type === 'pistol') { I.pistol = true; if (I.cur === 'none') I.cur = 'pistol'; say('وجدتَ مسدساً (فرد) — اضغط 1 لتجهيزه، وابحث عن طلقات', 4200); }
    else if (it.type === 'sniper') { I.sniper = true; if (I.cur === 'none') I.cur = 'sniper'; say('وجدتَ بندقية قنّاص — كليك يمين للتصويب', 4200); }
    else if (it.type === 'ammoP') { I.ammoP += it.amt; say('+' + it.amt + ' طلقات مسدس', 2200); }
    else { I.ammoS += it.amt; say('+' + it.amt + ' طلقات قنّاص', 2200); }
    refreshWeaponUI();
  } else if (b.type === 'key') {
    W.keyItem.got = true; G.hasKey = true; SND.pickup(); say('وجدتَ مفتاحاً قديماً — جرّب باب المكتبة', 3500); updateHud();
  } else if (b.type === 'hide') {
    const h = W.hides[b.i]; p.hiding = b.i; p.x = h.x; p.z = h.z; p.vx = p.vz = 0; p.yaw = Math.atan2(-h.fx, -h.fz); p.pitch = 0;
    SND.hide(true); G.prevFlash = G.flashOn; G.flashOn = false; G.aim = false;
    const e = G.e; p.sawEnter = !!(e && e.vis && e.dist < 13 && e.state === 'chase');
    document.body.classList.add('hiding');
  } else if (b.type === 'unhide') {
    const h = W.hides[p.hiding]; p.x = h.x + h.fx * 1.1; p.z = h.z + h.fz * 1.1; p.hiding = -1; SND.hide(false);
    G.flashOn = G.prevFlash !== false; p.sawEnter = false;
    document.body.classList.remove('hiding');
  }
}
function showNote(t) {
  const n = $('note'); n.querySelector('p').textContent = t; n.classList.add('on'); G.noteT = 6.5;
}
function updateHud() {
  $('pg').textContent = G.pages + ' / ' + NEED;
  $('keyi').classList.toggle('on', G.hasKey);
  const obj = G.pages >= NEED ? 'اهرب إلى ساحة المدينة (جنوباً)' : `اجمع ${NEED} أوراق من أرجاء البيت`;
  $('obj').textContent = obj;
  refreshWeaponUI();
}

/* ============ render loop, lighting, UI wiring ============ */
const LU = { lp: new Float32Array(24), lc: new Float32Array(18) };
const noise1 = (x, s) => fbm(x, 0.37 + s * 0.013, 7 + (s | 0), 4096, 4096, 2);
let curLights = [];

function lightFactor(l, t, idx) {
  let f = 1;
  switch (l.kind) {
    case 'flicker': f = 0.58 + 0.62 * noise1(t * 6.5 * l.w + l.ph, idx) + 0.08 * Math.sin(t * 2.1 + l.ph); break;
    case 'buzz': {
      const step = Math.floor(t * 9 * l.w + l.ph);
      const cut = hash2(step, idx, 3) > 0.935 - (G.fear * 0.07);
      const dip = hash2(Math.floor(t * 0.6 + l.ph), idx, 9) > 0.86 ? 0.35 + 0.4 * hash2(step, idx, 4) : 1;
      f = (cut ? 0.05 : 1) * dip * (0.94 + 0.06 * Math.sin(t * 100)); break;
    }
    case 'moon': f = 0.88 + 0.12 * noise1(t * 0.35 + l.ph, idx); break;
    default: f = 1;
  }
  const e = G.e;
  if (e && e.state !== 'wait' && e.state !== 'dead') {
    const dd = Math.hypot(l.pos[0] - e.x, l.pos[2] - e.z);
    const infl = smooth(10, 2.5, dd);
    if (infl > 0) f *= 1 - infl * (hash2(Math.floor(t * 14), idx, 1) > 0.35 ? 0.88 : 0.15);
  }
  return f;
}
function updateLights(t) {
  curLights.length = 0;
  W.lights.forEach((l, i) => { l.cur = lightFactor(l, t, i) * l.k; });
  const cam = G.camPos;
  const arr = W.lights.map(l => ({ l, d: Math.hypot(l.pos[0] - cam[0], l.pos[1] - cam[1], l.pos[2] - cam[2]) / l.radius }));
  arr.sort((a, b) => a.d - b.d);
  const e = G.e;
  let n = 0;
  const push = (pos, col, r) => {
    LU.lp[n * 4] = pos[0]; LU.lp[n * 4 + 1] = pos[1]; LU.lp[n * 4 + 2] = pos[2]; LU.lp[n * 4 + 3] = r;
    LU.lc[n * 3] = col[0]; LU.lc[n * 3 + 1] = col[1]; LU.lc[n * 3 + 2] = col[2]; n++;
  };
  if (G.muzzle > 0 && G.fwdv) {
    const f = G.fwdv, k = G.muzzle / 0.07;
    push([cam[0] + f[0] * 1.2, cam[1] + f[1] * 1.2, cam[2] + f[2] * 1.2], [9 * k, 5 * k, 1.6 * k], 14);
  }
  if (e && e.state === 'chase') {
    const pulse = 0.7 + 0.3 * Math.sin(G.t * 9);
    push([e.x, 2.4, e.z], [1.1 * pulse, 0.05, 0.04], 6);
  }
  for (const a of arr) { if (n >= 6) break; if (a.d > 1.6) break; const c = a.l.base, k = a.l.cur * 2.6; push(a.l.pos, [c[0] * k, c[1] * k, c[2] * k], a.l.radius); }
  LU.n = n;
}

function setMat(P, m) {
  const gl = R.gl;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.diff);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.norm);
  P.v2('uSpec', m.spec[0], m.spec[1]); P.f('uNormStr', m.ns); P.f('uDirt', m.dirt);
}
const ID4 = M4.ident();
const NOCAST = { wood: 1, tile: 1, carpet: 1, ceil: 1, window: 1, paint: 1, grass: 1, road: 1, glass: 1, litwin: 1 };

function entityPass(setM) {
  const e = G.e; if (!e || e.state === 'wait') return null;
  const w = e.walk, mv = e.speed > 0.1 ? 1 : 0.15, chase = e.state === 'chase';
  const sw = Math.sin(w) * mv, base = M4.chain(M4.trans(e.x, 0, e.z), M4.rotY(e.yaw));
  const hipY = 1.3 + Math.abs(Math.sin(w)) * 0.03 * mv;
  const body = M4.chain(base, M4.trans(0, hipY, 0), M4.rotX(e.lean + Math.sin(G.t * 1.3) * 0.015));
  setM(PART.torso, body);
  const head = M4.chain(body, M4.trans(0, 1.02, 0.02), M4.rotX(0.22 + e.lean * 0.4 + (chase ? 0.2 : 0)), M4.rotY(e.twitch * 0.5 + Math.sin(G.t * 0.7) * 0.18), M4.rotZ(Math.sin(G.t * 0.45) * 0.12 + 0.16));
  setM(PART.head, head);
  for (const s of [-1, 1]) {
    const ph = s > 0 ? 0 : PI;
    const aU = chase ? -1.25 + Math.sin(w + ph) * 0.3 : -0.06 + Math.sin(w + ph) * 0.3 * mv;
    const aL = chase ? -0.35 : -0.16 - 0.1 * Math.sin(w * 0.5);
    const sh = M4.chain(body, M4.trans(s * 0.27, 0.92, 0), M4.rotZ(s * 0.1), M4.rotX(aU));
    setM(PART.uarm, sh);
    setM(PART.larm, M4.chain(sh, M4.trans(0, -0.72, 0), M4.rotX(aL)));
    const lp = s > 0 ? 0 : PI, th = Math.sin(w + lp) * 0.62 * mv, kn = 0.15 + 0.7 * Math.max(0, Math.sin(w + lp + 1.1)) * mv;
    const hp = M4.chain(base, M4.trans(s * 0.1, hipY, 0), M4.rotX(th));
    setM(PART.thigh, hp);
    setM(PART.shin, M4.chain(hp, M4.trans(0, -0.66, 0), M4.rotX(kn)));
  }
  return head;
}

function render(dt) {
  const gl = R.gl, p = G.p, t = G.t;
  const oa = G.outA;
  // ----- camera -----
  let eyeY = p.hiding >= 0 ? 1.45 : 1.65 + Math.sin(p.bob) * 0.035 * Math.min(1, p.speed / 2.5) * (p.sprinting ? 1.5 : 1);
  let eye = [p.x + (p.hiding >= 0 ? 0 : Math.cos(p.bob * 0.5) * 0.012 * Math.min(1, p.speed / 2.5)), eyeY, p.z];
  let yaw = p.yaw, pitch = p.pitch, roll = p.roll;
  if (G.state === 'menu') { yaw = Math.sin(G.t * 0.12) * 0.35; pitch = 0.02; roll = 0; eye = [42, 1.7, 100]; }
  if (G.state === 'dying' || G.state === 'dead') {
    const e = G.e, tx = e.x - p.x, tz = e.z - p.z;
    const ty = Math.atan2(-tx, -tz); let dy = Math.atan2(Math.sin(ty - p.yaw), Math.cos(ty - p.yaw));
    p.yaw += dy * Math.min(1, dt * 14); yaw = p.yaw;
    const hd = Math.hypot(tx, tz); pitch = Math.atan2(2.45 - eye[1], hd) * 0.9; p.pitch = pitch;
    // entity lunges to face distance
    const want = 0.75; if (hd > want) { e.x -= tx / hd * Math.min(hd - want, dt * 7); e.z -= tz / hd * Math.min(hd - want, dt * 7); }
    e.yaw = Math.atan2(-tx, -tz) + PI; e.lean = 0.5;
    eye[0] += (Math.random() - 0.5) * 0.04 * Math.max(0, 1 - G.deadT * 0.5); eye[1] += (Math.random() - 0.5) * 0.04 * Math.max(0, 1 - G.deadT * 0.5);
  }
  const fwd = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  G.camPos = eye; G.fwdv = fwd;
  G.aimK = damp(G.aimK || 0, (G.aim && G.inv.cur !== 'none' && G.state === 'play') ? 1 : 0, 12, dt);
  const sniperScoped = G.inv.cur === 'sniper' && G.aimK > 0.85;
  $('scope').classList.toggle('on', sniperScoped);
  document.body.classList.toggle('scoped', sniperScoped);
  const asp = R.w / R.h;
  let fov = 1.22 - Math.min(0.12, G.fear * 0.08) + (p.sprinting ? 0.06 : 0) + G.pulse * 0.05;
  fov = lerp(fov, G.inv.cur === 'sniper' ? 0.26 : 0.9, G.aimK);
  const up = [Math.sin(roll) * right[0], Math.cos(roll), Math.sin(roll) * right[2]];
  const view = M4.lookAt(eye, V3.add(eye, fwd), up), proj = M4.persp(fov, asp, 0.07, 170), VP = M4.mul(proj, view);

  // ----- flashlight -----
  G.fyaw = G.fyaw === undefined ? yaw : G.fyaw + Math.atan2(Math.sin(yaw - G.fyaw), Math.cos(yaw - G.fyaw)) * Math.min(1, dt * 13);
  G.fpitch = G.fpitch === undefined ? pitch : lerp(G.fpitch, pitch, Math.min(1, dt * 13));
  const fdir = [-Math.sin(G.fyaw) * Math.cos(G.fpitch), Math.sin(G.fpitch), -Math.cos(G.fyaw) * Math.cos(G.fpitch)];
  const fpos = [eye[0] + right[0] * 0.17 + fdir[0] * 0.2, eye[1] - 0.13, eye[2] + right[2] * 0.17 + fdir[2] * 0.2];
  let fi = 1; const e = G.e;
  if (e && e.state !== 'wait' && e.state !== 'dead' && e.los && e.dist < 8) fi = hash2(Math.floor(t * 18), 5, 2) > 0.45 ? 1 : 0.06;
  else if (G.fear > 0.55 && hash2(Math.floor(t * 12), 7, 2) > 0.93) fi = 0.15;
  if (G.state === 'dying') fi = hash2(Math.floor(t * 30), 5, 2) > 0.5 ? 1 : 0;
  G.flashI = damp(G.flashI, fi, 40, dt);
  const flashOn = G.flashOn && G.state !== 'dead';
  const fc = flashOn ? [30 * G.flashI, 26.5 * G.flashI, 20.5 * G.flashI] : [0, 0, 0];
  const shP = M4.persp(1.28, 1, 0.12, 32), shV = M4.lookAt(fpos, V3.add(fpos, fdir), Math.abs(fdir[1]) > 0.97 ? [1, 0, 0] : [0, 1, 0]), shVP = M4.mul(shP, shV);

  updateLights(t);

  // ----- door model matrices -----
  const doorMs = W.doors.map(d => {
    const a = d.open * 1.75 * (d.axis === 'y' ? -1 : 1) * d.side;
    if (d.axis === 'y') return d.side > 0 ? M4.chain(M4.trans(d.cx * CS, 0, d.cy * CS + 1), M4.rotY(a)) : M4.chain(M4.trans(d.cx * CS + 2, 0, d.cy * CS + 1), M4.rotY(PI), M4.rotY(-a * 1));
    return M4.chain(M4.trans(d.cx * CS + 1, 0, d.cy * CS), M4.rotY(a));
  });

  // ----- shadow pass -----
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.shFbo); gl.viewport(0, 0, R.shRes, R.shRes);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.colorMask(false, false, false, false);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.5, 5);
  if (flashOn) {
    const D = R.depth.use(); D.m4('uVP', shVP); D.m4('uModel', ID4);
    for (const s of W.static) if (!NOCAST[s.key]) R.drawMesh(s.mesh);
    W.doors.forEach((d, i) => { D.m4('uModel', doorMs[i]); R.drawMesh(d.exit ? DOORM.ex : (d.axis === 'y' ? DOORM.y : DOORM.x)); });
    entityPass((m, M) => { D.m4('uModel', M); R.drawMesh(m); });
  }
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);

  // ----- main pass -----
  const fogCol = [lerp(0.003, 0.02, oa), lerp(0.0045, 0.03, oa), lerp(0.008, 0.06, oa)];
  const ms = R.rt.ms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, ms ? ms.fbo : R.rt.sceneFbo);
  gl.viewport(0, 0, R.w, R.h); gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
  const S = R.scene.use();
  S.i('uDiff', 0); S.i('uNorm', 1); S.i('uMap', 2); S.i('uShadow', 3);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mapTex);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.shTex);
  S.m4('uVP', VP); S.m4('uModel', ID4); S.m4('uShadowVP', shVP); S.v3('uCam', eye);
  S.v3('uFP', fpos); S.v3('uFD', fdir); S.v3('uFC', fc); S.v2('uFCone', Math.cos(0.58), Math.cos(0.2)); S.f('uShTexel', 1 / R.shRes);
  S.fv4('uLP', LU.lp); S.fv3('uLC', LU.lc); S.i('uNL', LU.n);
  S.v3('uEmis', [0, 0, 0]); S.f('uTime', t); S.f('uFog', lerp(0.052, 0.021, oa)); S.v3('uFogCol', fogCol);
  S.v3('uAmb', [lerp(0.03, 0.5, oa), lerp(0.036, 0.62, oa), lerp(0.055, 1.0, oa)]);
  S.v4('uMapInfo', [MW, MH, CS, 0]); S.i('uOcc', 12); S.f('uAlpha', 1);
  for (const s of W.static) {
    if (s.key === 'window') continue;
    setMat(S, MAT[s.key]);
    if (s.key === 'litwin') S.v3('uEmis', [1.5, 1.0, 0.45]);
    R.drawMesh(s.mesh);
    if (s.key === 'litwin') S.v3('uEmis', [0, 0, 0]);
  }
  // draw semi-transparent windows last so forest shows through
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const s of W.static) {
    if (s.key !== 'window') continue;
    setMat(S, MAT.window); S.f('uAlpha', 0.22); R.drawMesh(s.mesh);
  }
  S.f('uAlpha', 1); gl.depthMask(true); gl.disable(gl.BLEND);
  // doors
  setMat(S, MAT.furn);
  W.doors.forEach((d, i) => { S.m4('uModel', doorMs[i]); R.drawMesh(d.exit ? DOORM.ex : (d.axis === 'y' ? DOORM.y : DOORM.x)); });
  // entity as terrifying dust/shadow cloud
  const showE = G.e && G.e.state !== 'wait' && !(G.e.ghost > 0 && hash2(Math.floor(t * 20), 3, 3) > 0.6);
  if (showE) {
    setMat(S, MAT.glow);
    const e = G.e;
    const dustN = 48;
    for (let i = 0; i < dustN; i++) {
      const ph = i * 0.37 + t * (e.state === 'chase' ? 3.2 : 1.1);
      const rad = 0.35 + Math.sin(ph * 0.7) * 0.25;
      const ang = ph + i;
      const px = e.x + Math.cos(ang) * rad * (0.6 + Math.sin(t * 2 + i) * 0.4);
      const pz = e.z + Math.sin(ang) * rad * (0.6 + Math.cos(t * 1.7 + i) * 0.4);
      const py = 0.4 + (i % 7) * 0.28 + Math.sin(t * 4 + i) * 0.15;
      S.m4('uModel', M4.trans(px, py, pz));
      S.v3('uEmis', [0.01 + Math.sin(t * 3 + i) * 0.01, 0.01, 0.015]);
      R.drawMesh(MESH.flame); // reuse small sphere
    }
  }
  // pages & key (emissive hint so they read in the dark)
  setMat(S, MAT.paper);
  for (const pg of W.pages) {
    if (pg.got) continue;
    const bob = Math.sin(t * 1.7 + pg.ph) * 0.02;
    S.m4('uModel', M4.chain(M4.trans(pg.pos[0], pg.pos[1] + 0.03 + bob, pg.pos[2]), M4.rotY(pg.ry + Math.sin(t * 0.6 + pg.ph) * 0.15), M4.rotZ(0.04)));
    S.v3('uEmis', [0.16 + 0.1 * Math.sin(t * 2 + pg.ph), 0.14 + 0.08 * Math.sin(t * 2 + pg.ph), 0.09]);
    R.drawMesh(MESH.page);
  }
  // weapons and ammo lying around
  setMat(S, MAT.skin);
  for (const it of W.items) {
    if (it.got) continue;
    const bob = Math.sin(t * 1.6 + it.ph) * 0.015, ry = it.ry + t * 0.35;
    S.m4('uModel', M4.chain(M4.trans(it.pos[0], it.pos[1] + 0.05 + bob, it.pos[2]), M4.rotY(ry)));
    S.v3('uEmis', it.type === 'ammoP' ? [0.35, 0.26, 0.08] : it.type === 'ammoS' ? [0.12, 0.3, 0.38] : [0.14, 0.22, 0.32]);
    R.drawMesh(it.type === 'pistol' ? MESH.pistolV : it.type === 'sniper' ? MESH.sniperV : MESH.ammo);
  }
  if (W.keyItem && !W.keyItem.got) {
    setMat(S, MAT.glow);
    S.m4('uModel', M4.chain(M4.trans(W.keyItem.pos[0], W.keyItem.pos[1] + 0.08 + Math.sin(t * 2) * 0.03, W.keyItem.pos[2]), M4.rotY(t * 1.1)));
    S.v3('uEmis', [3.4, 2.3, 0.5]); R.drawMesh(MESH.key);
  }
  // emissive props (flames, lamp shades, fire, street lamps)
  setMat(S, MAT.glow);
  for (const em of W.emit) {
    const f = em.light ? Math.min(1.6, em.light.cur / Math.max(0.0001, em.light.k)) : 0.8 + 0.2 * Math.sin(t * 9 + em.pos[0]);
    S.v3('uEmis', [em.col[0] * f, em.col[1] * f, em.col[2] * f]);
    let sc = M4.trans(em.pos[0], em.pos[1], em.pos[2]);
    S.m4('uModel', sc); R.drawMesh(MESH[em.mesh]);
  }
  // beacon over the town square once every page is found
  if (G.pages >= NEED) {
    S.v3('uEmis', [0.1, 1.8, 0.5]); S.m4('uModel', M4.trans(SQ[0], 0, SQ[1])); R.drawMesh(MESH.beacon);
  }
  const ex = W.doors.find(d => d.exit);
  if (ex) {
    S.v3('uEmis', [0.2, 2.6, 0.5]);
    S.m4('uModel', M4.trans(42, 3.0, 59.82)); R.drawMesh(MESH.sign);
  }
  S.v3('uEmis', [0, 0, 0]);
  // first-person weapon (drawn on top of the world)
  if (G.inv.cur !== 'none' && (G.state === 'play' || G.state === 'inv' || G.state === 'paused') && p.hiding < 0 && !(G.inv.cur === 'sniper' && G.aimK > 0.6)) {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const snp = G.inv.cur === 'sniper', back = [-fwd[0], -fwd[1], -fwd[2]], gup = V3.cross(back, right);
    const rc = G.recoil, bobv = Math.sin(p.bob) * 0.006 * Math.min(1, p.speed / 2.5);
    const ox = snp ? 0.15 : lerp(0.16, 0.0, G.aimK), oy = (snp ? -0.15 : lerp(-0.15, -0.1, G.aimK)) + bobv + rc * 0.02, oz = (snp ? 0.44 : 0.4) - rc * 0.07;
    const gp = [eye[0] + right[0] * ox + gup[0] * oy + fwd[0] * oz, eye[1] + right[1] * ox + gup[1] * oy + fwd[1] * oz, eye[2] + right[2] * ox + gup[2] * oy + fwd[2] * oz];
    let gm = new Float32Array([right[0], right[1], right[2], 0, gup[0], gup[1], gup[2], 0, back[0], back[1], back[2], 0, gp[0], gp[1], gp[2], 1]);
    gm = M4.mul(gm, M4.rotX(rc * 0.12));
    setMat(S, MAT.skin); S.v3('uEmis', [0.015, 0.015, 0.02]); S.m4('uModel', gm);
    R.drawMesh(snp ? MESH.sniperV : MESH.pistolV);
    if (G.muzzle > 0) {
      setMat(S, MAT.glow); S.v3('uEmis', [7, 4, 1.2]);
      S.m4('uModel', M4.mul(gm, M4.trans(0, 0, snp ? -1.06 : -0.27))); R.drawMesh(MESH.flash);
    }
    S.v3('uEmis', [0, 0, 0]);
  }
  if (ms) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.rt.sceneFbo);
    gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  R.post({ time: t, fear: G.state === 'menu' ? 0.15 : G.fear, hit: G.hit, pulse: G.pulse, glitch: G.glitch, fade: G.fade, exp: 1.9, bloom: 0.5, thr: 0.9, white: G.white });
}

/* ---------- main update ---------- */
function updateMapTex() {
  for (let i = 0; i < MW * MH; i++) mapData[i] = W.solid[i] ? 255 : 0;
  for (const d of W.doors) if (doorBlocks(d)) mapData[cellIdx(d.cx, d.cy)] = 255;
  const gl = R.gl; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mapTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MW, MH, gl.RED, gl.UNSIGNED_BYTE, mapData);
}
function step(dt) {
  G.t += dt;
  G.fade = Math.min(1, G.fade + dt * 0.7);
  G.hit = Math.max(0, G.hit - dt * (G.state === 'dying' ? 0.2 : 0.8)); G.pulse = Math.max(0, G.pulse - dt * 1.2); G.glitch = Math.max(0, G.glitch - dt * 1.4);
  if (G.state === 'play' || G.state === 'dying') {
    G.cool = Math.max(0, G.cool - dt); G.recoil = Math.max(0, G.recoil - dt * 5); G.muzzle = Math.max(0, G.muzzle - dt);
  }
  if (G.state === 'play') {
    G.runT += dt;
    updatePlayer(dt); updateDoors(dt); updateEntity(dt); updateInteract(dt);
    if ((G.mouseFire || G.touchFire) && G.inv.cur !== 'none') fire();
    const e = G.e; let target = G.p.hiding >= 0 ? 0.28 : 0;
    if (e && e.state !== 'wait') {
      if (e.state === 'chase') target = Math.max(target, 0.78 + 0.22 * (1 - smooth(2, 14, e.dist)));
      else if (e.los) target = Math.max(target, 0.55 * (1 - smooth(3, 18, e.dist)));
      else target = Math.max(target, 0.4 * (1 - smooth(2, 12, e.dist)));
    }
    G.fear = damp(G.fear, target, target > G.fear ? 2.4 : 0.6, dt);
    if (G.fear > 0.65 && Math.random() < dt * 1.4) G.glitch = Math.max(G.glitch, 0.15 + Math.random() * 0.25);
    if (e && e.state === 'chase' && e.vis) e.ghost = 0;
    const outT = (G.p.x < 0 || G.p.x > MW * CS || G.p.z < 0 || G.p.z > 62) ? 1 : 0;
    G.outA = damp(G.outA, outT, 3, dt);
    SND.update(dt, { fear: G.fear, chase: e && e.state === 'chase' ? 1 : 0, sprint: G.p.sprinting, hiding: G.p.hiding >= 0, outside: G.outA > 0.5, pan: 0 });
    if (G.noteT > 0) { G.noteT -= dt; if (G.noteT <= 0) $('note').classList.remove('on'); }
    // place name toast
    const pn = placeName(G.p.x, G.p.z);
    if (pn && pn !== G.zone) { G.zone = pn; $('room').textContent = pn; }
    // goal: the town square
    const sq = Math.hypot(G.p.x - SQ[0], G.p.z - SQ[1]);
    G.hudT -= dt;
    if (G.hudT <= 0) { G.hudT = 0.5; if (G.pages >= NEED) $('obj').textContent = 'اهرب إلى ساحة المدينة — ' + Math.round(sq) + ' م'; }
    if (sq < 9) {
      if (G.pages >= NEED) winGame();
      else if (!G.sqWarn) { G.sqWarn = true; say(`اجمع الأوراق السبع أولاً (${G.pages}/${NEED})`, 3500); }
    } else if (sq > 16) G.sqWarn = false;
  } else if (G.state === 'dying') {
    G.deadT += dt; updateEntityAnim(dt);
    if (G.deadT > 2.7) { G.state = 'dead'; showDead(); }
  } else if (G.state === 'menu') {
    G.outA = 1;
    SND.ok && SND.update(dt, { fear: 0.05, chase: 0, sprint: false, hiding: false, outside: true, pan: 0 });
  }
  if (G.state === 'play' || G.state === 'dying' || G.state === 'menu') updateMapTex();
}
function updateEntityAnim(dt) { const e = G.e; e.walk += dt * 2; e.speed = 0; }

/* ---------- state transitions ---------- */
function resetWorld() {
  W.pages.forEach(p => p.got = false); if (W.keyItem) W.keyItem.got = false;
  W.items.forEach(i => i.got = false);
  W.doors.forEach(d => { d.open = 0; d.target = 0; d.warned = false; d.locked = d.lockedInit; if (d.exit) { d.open = 1; d.target = 1; } });
  const P = G.p; P.x = 42; P.z = 100; P.vx = P.vz = 0; P.yaw = 0; P.pitch = 0; P.stam = 1; P.hiding = -1; P.exhausted = false; P.sawEnter = false;
  G.pages = 0; G.hasKey = false; G.flashOn = true; G.fear = 0; G.chaseAmt = 0; G.hit = 0; G.glitch = 0; G.pulse = 0; G.white = 0; G.lastSeen = 99; G.everSeen = false;
  G.runT = 0; G.t = 0; G.fyaw = undefined; G.fpitch = undefined; G.e = newEntity(); G.room = -9; G.zone = null;
  G.inv = { pistol: false, sniper: false, ammoP: 0, ammoS: 0, cur: 'none' };
  G.cool = 0; G.recoil = 0; G.muzzle = 0; G.aim = false; G.aimK = 0; G.mouseFire = false; G.touchFire = false; G.outA = 1; G.sqWarn = false; G.hudT = 0;
  document.body.classList.remove('hiding', 'scoped', 'armed'); $('note').classList.remove('on'); $('inv').classList.remove('on'); G.prompt = '';
  updateHud();
}
function startGame() {
  // request fullscreen immediately on user click (more reliable)
  const d = document.documentElement;
  const req = d.requestFullscreen || d.webkitRequestFullscreen || d.mozRequestFullScreen || d.msRequestFullscreen;
  if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
    try { req.call(d); } catch (e) {}
  }
  SND.init(); SND.ctx && SND.ctx.resume();
  resetWorld(); G.state = 'play'; G.fade = 0;
  $('menu').classList.remove('on'); $('dead').classList.remove('on'); $('win').classList.remove('on'); $('pause').classList.remove('on');
  document.body.classList.add('playing');
  if (!isTouch) { try { canvas.requestPointerLock(); } catch (e) { } }
  setTimeout(() => say('...البيت صامت أكثر من اللازم', 3000), 900);
  setTimeout(() => say(`ادخل البيت، اجمع ${NEED} أوراق، ثم اهرب إلى ساحة المدينة`, 4200), 4300);
  setTimeout(() => say('R للمصباح • F للتفاعل • E للحقيبة', 4200), 9000);
  setTimeout(() => say('الأسلحة والطلقات مبعثرة في البيت وحوله', 4000), 14000);
}
function showDead() {
  $('dead-stats').textContent = `الأوراق: ${G.pages} / ${NEED}   •   الوقت: ${fmtT(G.runT)}`;
  $('dead').classList.add('on'); document.body.classList.remove('playing', 'scoped'); $('scope').classList.remove('on');
  if (document.pointerLockElement) document.exitPointerLock();
}
function winGame() {
  G.state = 'won'; SND.win(); G.winT = 0;
  $('win-stats').textContent = `الوقت: ${fmtT(G.runT)}`;
  document.body.classList.remove('playing', 'scoped'); $('scope').classList.remove('on'); $('win').classList.add('on');
  if (document.pointerLockElement) document.exitPointerLock();
}
const fmtT = s => { s = Math.floor(s); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused'; G.mouseFire = false; G.touchFire = false; $('pause').classList.add('on'); document.body.classList.remove('playing'); SND.duck(true);
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'play'; $('pause').classList.remove('on'); document.body.classList.add('playing'); SND.duck(false);
  if (!isTouch) { try { canvas.requestPointerLock(); } catch (e) { } }
}

/* ---------- quality ---------- */
function applyQuality(q) {
  G.settings.q = q;
  const dpr = window.devicePixelRatio || 1;
  const cfg = { ultra: [Math.min(dpr, 2), 4096, 4], high: [Math.min(dpr, 1.5), 2048, 4], medium: [Math.min(dpr, 1), 1536, 4], low: [0.7, 1024, 0] }[q];
  G.scale = cfg[0]; R.samples = cfg[2];
  if (R.shRes !== cfg[1]) R.makeShadow(cfg[1]);
  R.w = 0; resize();
}
function resize() {
  const w = Math.round(innerWidth * G.scale), h = Math.round(innerHeight * G.scale);
  canvas.width = w; canvas.height = h; R.resize(w, h);
}

/* ---------- loop ---------- */
let lastT = 0, slow = 0, frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!R || G.state === 'loading') return;
  if (G.freeze) { if (!G.once) return; G.once = false; }
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (G.state !== 'paused') step(dt);
  render(dt);
  frames++; slow = slow * 0.97 + dt * 0.03;
  if (frames % 120 === 0 && slow > 0.034 && G.scale > 0.5 && G.state === 'play') { G.scale *= 0.88; resize(); }
}

/* ============ boot: build, input, menu ============ */
async function boot() {
  canvas = $('gl');
  try {
    R = new Renderer(canvas);
  } catch (err) {
    $('loadmsg').textContent = 'تعذّر تشغيل WebGL2 على هذا الجهاز أو المتصفح. جرّب Chrome أو Safari حديث.';
    $('loadbar').style.display = 'none'; return;
  }
  SND = new Sound();
  const isMobile = isTouch;
  G.scale = 1; applyQuality('low');
  $('q-' + G.settings.q).checked = true;
  const prog = f => { $('loadbar').firstElementChild.style.width = Math.round(f * 100) + '%'; };
  $('loadmsg').textContent = 'جارٍ نسج الخامات...';
  MAT = await buildMaterials(R, p => prog(p * 0.6));
  $('loadmsg').textContent = 'جارٍ بناء البيت...';
  await tick();
  W = new WorldBuilder(MAT);
  W.buildShell(); prog(0.7); await tick();
  populate(W); prog(0.8);
  $('loadmsg').textContent = 'جارٍ بناء الحديقة والشارع والمدينة والغابة...';
  await tick();
  buildOutside(W); prog(0.95); await tick();
  W = Object.assign(W, W.finish(R));
  W.doors.forEach(d => { d.lockedInit = d.locked; if (d.exit) { d.open = 1; d.target = 1; } });
  buildDynMeshes();
  // occlusion map texture
  const gl = R.gl;
  mapData = new Uint8Array(MW * MH);
  mapTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, mapTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, MW, MH, 0, gl.RED, gl.UNSIGNED_BYTE, mapData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  prog(1);
  G.e = null; G.state = 'menu'; G.fade = 0; G.camPos = [42, 1.7, 100]; G.outA = 1;
  $('loading').classList.remove('on'); $('menu').classList.add('on');
  // auto request fullscreen when options menu appears
  setTimeout(() => {
    const d = document.documentElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen || d.mozRequestFullScreen || d.msRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try { req.call(d); } catch (e) {}
    }
  }, 100);
  updateHud();
  window.__G = G; window.__W = W;
  requestAnimationFrame(loop);
}

/* ---------- input ---------- */
addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault();
  G.keys[e.code] = true;
  if (!e.repeat) {
    if (e.code === 'KeyR' && G.state === 'play' && G.p.hiding < 0) toggleFlash();
    if (e.code === 'KeyE') { if (G.state === 'play') openInv(); else if (G.state === 'inv') closeInv(); }
    if ((G.state === 'play' || G.state === 'inv') && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
      equip(e.code === 'Digit1' ? 'pistol' : e.code === 'Digit2' ? 'sniper' : 'none');
      if (G.state === 'inv') renderInv();
    }
    if (e.code === 'Escape') { if (G.state === 'play') pauseGame(); else if (G.state === 'inv') closeInv(); }
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; G.mouseFire = false; if (G.state === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pauseGame(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas && G.state === 'play') { G.look.dx += e.movementX; G.look.dy += e.movementY; }
});
addEventListener('mousedown', e => {
  if (G.state !== 'play' || document.pointerLockElement !== canvas) return;
  if (e.button === 0) { G.mouseFire = true; fire(); }
  if (e.button === 2 && G.inv.cur !== 'none') G.aim = true;
});
addEventListener('mouseup', e => { if (e.button === 0) G.mouseFire = false; if (e.button === 2) G.aim = false; });
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'play' && !isTouch) pauseGame();
});
addEventListener('resize', () => { if (R) resize(); });

// touch controls
(function touch() {
  const zone = $('touchzone'); let joyId = null, lookId = null, jo = null, lo = null;
  const stick = $('stick'), knob = $('knob');
  zone.addEventListener('pointerdown', e => {
    if (G.state !== 'play') return;
    zone.setPointerCapture && 0;
    const left = e.clientX < innerWidth * 0.45;
    if (left && joyId === null) {
      joyId = e.pointerId; jo = { x: e.clientX, y: e.clientY };
      stick.style.left = jo.x + 'px'; stick.style.top = jo.y + 'px'; stick.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    } else if (!left && lookId === null) { lookId = e.pointerId; lo = { x: e.clientX, y: e.clientY }; }
    e.preventDefault();
  });
  addEventListener('pointermove', e => {
    if (e.pointerId === joyId && jo) {
      let dx = e.clientX - jo.x, dy = e.clientY - jo.y; const d = Math.hypot(dx, dy), m = 58;
      if (d > m) { dx = dx / d * m; dy = dy / d * m; }
      G.joy.x = dx / m; G.joy.y = dy / m; knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
      G.touchSprint = d > m * 1.35 || (G.touchSprintBtn || false);
    } else if (e.pointerId === lookId && lo) {
      G.look.dx += (e.clientX - lo.x) * 1.7; G.look.dy += (e.clientY - lo.y) * 1.7; lo = { x: e.clientX, y: e.clientY };
    }
  });
  const up = e => {
    if (e.pointerId === joyId) { joyId = null; G.joy.x = 0; G.joy.y = 0; stick.classList.remove('on'); G.touchSprint = !!G.touchSprintBtn; }
    if (e.pointerId === lookId) lookId = null;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const hold = (id, on, off) => { const b = $(id); b.addEventListener('pointerdown', e => { on(); b.classList.add('down'); e.preventDefault(); e.stopPropagation(); }); const f = () => { off(); b.classList.remove('down'); }; b.addEventListener('pointerup', f); b.addEventListener('pointercancel', f); b.addEventListener('pointerleave', f); };
  hold('bAct', () => G.touchAct = true, () => G.touchAct = false);
  hold('bRun', () => { G.touchSprintBtn = true; G.touchSprint = true; }, () => { G.touchSprintBtn = false; G.touchSprint = false; });
  hold('bFire', () => { if (G.state === 'play') { G.touchFire = true; fire(); } }, () => { G.touchFire = false; });
  $('bFlash').addEventListener('pointerdown', e => { if (G.state === 'play' && G.p.hiding < 0) toggleFlash(); e.preventDefault(); e.stopPropagation(); });
  $('bInv').addEventListener('pointerdown', e => { if (G.state === 'play') openInv(); e.preventDefault(); e.stopPropagation(); });
  $('bAim').addEventListener('pointerdown', e => { if (G.state === 'play' && G.inv.cur !== 'none') G.aim = !G.aim; e.preventDefault(); e.stopPropagation(); });
  $('bPause').addEventListener('pointerdown', e => { pauseGame(); e.preventDefault(); e.stopPropagation(); });
  if (isTouch) document.body.classList.add('touch');
})();

/* ---------- menu wiring ---------- */
$('btnStart').addEventListener('click', () => {
  const d = document.documentElement;
  const req = d.requestFullscreen || d.webkitRequestFullscreen || d.mozRequestFullScreen || d.msRequestFullscreen;
  if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
    try { req.call(d); } catch (e) {}
  }
  startGame();
});
$('btnRetry').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnInvClose').addEventListener('click', closeInv);
$('btnMenu').addEventListener('click', () => { G.state = 'menu'; G.e = null; $('pause').classList.remove('on'); $('menu').classList.add('on'); document.body.classList.remove('playing', 'hiding', 'scoped'); $('scope').classList.remove('on'); SND.duck(false); });
canvas = $('gl');
canvas.addEventListener('click', () => { if (G.state === 'play' && !isTouch && document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (e) { } } });
document.querySelectorAll('input[name=q]').forEach(r => r.addEventListener('change', () => { if (r.checked && R) applyQuality(r.value); }));
$('sens').addEventListener('input', e => { G.settings.sens = +e.target.value; });
$('vol').addEventListener('input', e => { G.settings.vol = +e.target.value; if (SND.ok) SND.master.gain.value = G.settings.vol; });
$('btnFull').addEventListener('click', () => { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d); else document.exitFullscreen(); });
// boot(); // called after intro video


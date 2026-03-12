import { useEffect, useRef } from 'react';
import { Renderer, Camera, Geometry, Program, Mesh, Color, Vec2 } from 'ogl';

interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  className?: string;
}

const Silk = ({
  speed = 1.5,
  scale = 0.8,
  color = '#7B7481', // We will make this light in the shader
  noiseIntensity = 1.2,
  rotation = 0,
  className = ""
}: SilkProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const vertex = /* glsl */ `
    attribute vec2 uv;
    attribute vec3 position;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragment = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec3 uColor;
    uniform float uSpeed;
    uniform float uScale;
    uniform float uNoiseIntensity;
    uniform float uRotation;
    varying vec2 vUv;

    vec2 rotate(vec2 v, float a) {
      float s = sin(a);
      float c = cos(a);
      mat2 m = mat2(c, -s, s, c);
      return m * v;
    }

    void main() {
      vec2 uv = vUv;
      vec2 st = uv * 2.0 - 1.0;
      st.x *= uResolution.x / uResolution.y;
      
      st = rotate(st, uRotation);
      st *= uScale;

      float t = uTime * uSpeed * 0.1;
      
      vec2 p = st;
      for(int i=1; i<4; i++) {
        float fi = float(i);
        p.x += 0.3 / fi * sin(fi * p.y + t + 0.3 * fi) + 0.5;
        p.y += 0.3 / fi * sin(fi * p.x + t + 0.3 * fi) + 0.5;
      }

      float pattern = 0.5 + 0.5 * sin(p.x + p.y);
      pattern = pow(pattern, uNoiseIntensity);

      // Daytime mode: Blend with a very light background
      vec3 bgColor = vec3(0.99, 0.99, 0.99); // Off-white
      vec3 silkColor = mix(bgColor, uColor, 0.1); // Make the input color very subtle
      vec3 finalColor = mix(bgColor, silkColor, pattern * 0.15); // Very subtle waves
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    containerRef.current.appendChild(gl.canvas);

    const camera = new Camera(gl);
    camera.position.z = 5;

    const geometry = new Geometry(gl, {
      position: { size: 3, data: new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]) },
      uv: { size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2]) },
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2() },
        uColor: { value: new Color(color) },
        uSpeed: { value: speed },
        uScale: { value: scale },
        uNoiseIntensity: { value: noiseIntensity },
        uRotation: { value: rotation },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const width = containerRef.current?.offsetWidth || window.innerWidth;
      const height = containerRef.current?.offsetHeight || window.innerHeight;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value.set(width, height);
    };

    window.addEventListener('resize', resize);
    resize();

    let request: number;
    const update = (t: number) => {
      request = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    };
    request = requestAnimationFrame(update);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(request);
      if (containerRef.current && gl.canvas.parentNode) {
        containerRef.current.removeChild(gl.canvas);
      }
    };
  }, [color, speed, scale, noiseIntensity, rotation]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} />;
};

export default Silk;

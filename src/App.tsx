import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'

export default function App() {
  return (
    <Canvas
      style={{ width: '100vw', height: '100vh' }}
      camera={{ position: [5, 5, 5], fov: 50 }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>
      
      <OrbitControls />
      <EffectComposer>
        <Bloom 
          intensity={1.5} 
          luminanceThreshold={0.95} 
          luminanceSmoothing={0.4} 
        />
      </EffectComposer>
    </Canvas>
  )
}
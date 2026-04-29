import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, Float } from '@react-three/drei'
import * as THREE from 'three'
import type { RobotState } from '../App'

// ========== Placeholder robot ==========

function PlaceholderRobot({ state }: { state: RobotState }) {
  const bodyRef = useRef<THREE.Mesh>(null)
  const eye1Ref = useRef<THREE.Mesh>(null)

  const thrusterColor = {
    idle: '#4af',
    listening: '#f8f',
    speaking: '#ff6',
    thinking: '#af4',
  }[state]

  useFrame((_, delta) => {
    if (!bodyRef.current) return
    bodyRef.current.rotation.z *= 0.9
    if (eye1Ref.current && state === 'thinking') {
      eye1Ref.current.rotation.z += delta * 3
    }
  })

  return (
    <group>
      <mesh ref={bodyRef} position={[0, 0.1, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[1.2, 1.0, 0.25, 32]} />
        <meshStandardMaterial color="#ccc" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh ref={eye1Ref} position={[0.3, 0.2, 0.92]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#111" roughness={0.1} metalness={0.8} />
      </mesh>
      <mesh position={[0.38, 0.32, 1.08]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={3} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        <meshStandardMaterial color="#c8a000" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color={state === 'listening' ? '#ff2222' : '#ff6600'}
          emissive={state === 'listening' ? '#ff2222' : '#ff6600'}
          emissiveIntensity={4}
        />
      </mesh>
      {[[-0.7, -0.6, 0], [0.7, -0.6, 0], [0, -0.6, 0.7]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh>
            <cylinderGeometry args={[0.18, 0.22, 0.3, 16]} />
            <meshStandardMaterial color="#bbb" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <circleGeometry args={[0.18, 16]} />
            <meshStandardMaterial
              color={thrusterColor}
              emissive={thrusterColor}
              emissiveIntensity={5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ========== GLB robot ==========

function GLBRobot({ state, onReady }: { state: RobotState; onReady?: () => void }) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('./assets/robot.glb')
  const { actions, mixer } = useAnimations(animations, group)

  useEffect(() => {
    // バウンディングボックスで自動センタリング
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    // body_6 / body_7 が眼球本体（レンズと縁）。真っ黒に上書きする。
    // body_5 (mat: "eye hilight(ball)") は目のハイライトなので残す。
    const EYE_MESH_NAMES = new Set(['body_6', 'body_7'])

    const hsl = { h: 0, s: 0, l: 0 }
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const isEyeMesh = EYE_MESH_NAMES.has(obj.name)
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return
        if (isEyeMesh) {
          mat.color.set('#000000')
          mat.emissive.set('#000000')
          mat.emissiveIntensity = 0
          mat.metalness = 0.3
          mat.roughness = 0.15
          mat.toneMapped = true
          return
        }
        // グレー系（低彩度）のマテリアルは反射を抑えつつ明るくする
        mat.color.getHSL(hsl)
        const isGray = hsl.s < 0.15 && hsl.l > 0.15
        if (isGray) {
          mat.metalness = Math.min(mat.metalness, 0.05)
          mat.roughness = THREE.MathUtils.clamp(mat.roughness, 0.45, 0.6)
          // ベース色の明度を持ち上げて見た目を明るく
          mat.color.setHSL(hsl.h, hsl.s, Math.min(hsl.l + 0.2, 0.9))
        }
        if (mat.emissive && mat.emissive.getHex() !== 0x000000) {
          mat.emissiveIntensity = 6
          mat.toneMapped = false // bloomが正しく効くよう HDR値を維持
        }
      })
    })
  }, [scene])

  // GLBロード完了を通知
  useEffect(() => {
    onReady?.()
  }, [onReady])

  // Blenderの全アニメーションをループ再生
  useEffect(() => {
    Object.values(actions).forEach((clip) => {
      if (clip) clip.reset().play()
    })
    return () => mixer.stopAllAction()
  }, [actions, mixer])

  // state別エフェクト
  useFrame((_, delta) => {
    if (!group.current) return
    if (state === 'speaking') {
      group.current.position.y = Math.sin(Date.now() * 0.02) * 0.05
    } else {
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0, 0.05)
    }
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, 0.05)
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, 0.05)
  })

  return <primitive ref={group} object={scene} scale={0.6} />
}

// ========== Robot content (Suspense を使わず即座に表示) ==========

function RobotContent({ state }: { state: RobotState }) {
  const [glbReady, setGlbReady] = useState(false)

  return (
    <>
      {/* GLBロード完了まで PlaceholderRobot を即座に表示 */}
      {!glbReady && <PlaceholderRobot state={state} />}
      <Suspense fallback={null}>
        <GLBRobot state={state} onReady={() => setGlbReady(true)} />
      </Suspense>
    </>
  )
}

// ========== Main Scene ==========

export function RobotScene({ state }: { state: RobotState }) {
  return (
    <Canvas
      camera={{ position: [-6.11, 1.8, -2.22], fov: 35 }}
      style={{ background: 'transparent' }}
      gl={{
        alpha: true,
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.6,
      }}
    >
      {/* 環境光（全体を明るく持ち上げる） */}
      <ambientLight intensity={0.6} />

      {/* 正面からのキーライト */}
      <directionalLight position={[2, 3, 4]} intensity={1.6} color="#ffffff" />

      {/* 反対側からのフィルライト（影を和らげる） */}
      <directionalLight position={[-3, 2, 2]} intensity={0.9} color="#ffeedd" />

      {/* 上からのリムライト */}
      <directionalLight position={[0, 5, -2]} intensity={0.7} color="#ddeeff" />

      {/* スラスターの青白い下からの反射光 */}
      <pointLight position={[0, -2, 1]} intensity={3} color="#44aaff" distance={5} />

      {/* 胴体下部のオレンジグロー */}
      <pointLight position={[0, -1, 0]} intensity={2} color="#ff6633" distance={3} />

      <Float
        speed={state === 'idle' ? 1.5 : 0.5}
        rotationIntensity={0}
        floatIntensity={state === 'idle' ? 0.5 : 0.1}
      >
        <RobotContent state={state} />
      </Float>

    </Canvas>
  )
}

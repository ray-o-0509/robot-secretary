import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { RobotState } from '../App'

// 接続状態 × ロボット状態 → アンテナ球の色
function getAntennaColor(isConnected: boolean, state: RobotState): string {
  if (!isConnected) return '#ff4444'
  return {
    idle:      '#44ff88',
    listening: '#44ddff',
    speaking:  '#ff8844',
    thinking:  '#ffdd44',
  }[state]
}

type Velocity = { vx: number; vy: number; speed: number }
const FEET_TILT_PIVOT_NAME = 'feet_tilt_pivot'

// ========== Placeholder robot ==========

function PlaceholderRobot({ state, isConnected }: { state: RobotState; isConnected: boolean }) {
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
          color={getAntennaColor(isConnected, state)}
          emissive={getAntennaColor(isConnected, state)}
          emissiveIntensity={20}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, 1.45, 0]}
        color={getAntennaColor(isConnected, state)}
        intensity={8}
        distance={3}
      />
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

function GLBRobot({
  state,
  isConnected,
  onReady,
  velocityRef,
}: {
  state: RobotState
  isConnected: boolean
  onReady?: () => void
  velocityRef?: React.RefObject<Velocity>
}) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('./assets/robot.glb')
  const { actions, mixer } = useAnimations(animations, group)
  const antennaMatRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const antennaLightRef = useRef<THREE.PointLight>(null)
  const antennaPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.5, 0))
  const feetTiltRef = useRef<THREE.Object3D | null>(null)
  // 移動状態のステートマシン: idle / moving / returning
  // idle: 完全に手を出さない（Blenderアニメに任せる）
  // moving: 進行方向に傾ける
  // returning: 0に戻している途中、戻りきったら idle に切り替え
  const phaseRef = useRef<'idle' | 'moving' | 'returning'>('idle')

  useEffect(() => {
    // バウンディングボックスで自動センタリング
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    const feet = scene.getObjectByName('feet')
    if (feet) {
      if (feet.parent?.name === FEET_TILT_PIVOT_NAME) {
        feetTiltRef.current = feet.parent
      } else if (feet.parent) {
        const parent = feet.parent
        const pivot = new THREE.Group()
        pivot.name = FEET_TILT_PIVOT_NAME
        pivot.position.copy(feet.position)
        pivot.quaternion.copy(feet.quaternion)
        pivot.scale.copy(feet.scale)
        parent.add(pivot)
        pivot.add(feet)
        feet.position.set(0, 0, 0)
        feet.quaternion.identity()
        feet.scale.set(1, 1, 1)
        feetTiltRef.current = pivot
      }
    }

    // body_6 / body_7 が眼球本体（レンズと縁）。真っ黒に上書きする。
    // body_5 (mat: "eye hilight(ball)") は目のハイライトなので残す。
    const EYE_MESH_NAMES = new Set(['body_6', 'body_7'])
    // body_1 / body_3 がアンテナの縦柱（発光させない）
    const ANTENNA_POLE_NAMES = new Set(['body_1', 'body_3'])
    // body_2 がアンテナ先端の球（発光対象）
    const ANTENNA_BALL_NAME = 'body_2'

    // アンテナ球を位置ヒューリスティックで特定（最も高いY座標のメッシュ）
    let highestY = -Infinity
    let antennaMesh: THREE.Mesh | null = null

    const hsl = { h: 0, s: 0, l: 0 }
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const isEyeMesh = EYE_MESH_NAMES.has(obj.name)
      const isAntennaPole = ANTENNA_POLE_NAMES.has(obj.name)
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
        // (アンテナ柱の発光は削除。デフォルトのマテリアルのまま)
        // グレー系（低彩度）のマテリアルは反射を抑えつつ明るくする
        mat.color.getHSL(hsl)
        const isGray = hsl.s < 0.15 && hsl.l > 0.15
        if (isGray) {
          mat.metalness = Math.min(mat.metalness, 0.05)
          mat.roughness = THREE.MathUtils.clamp(mat.roughness, 0.45, 0.6)
          // ベース色の明度を持ち上げて見た目を明るく
          mat.color.setHSL(hsl.h, hsl.s, Math.min(hsl.l + 0.2, 0.9))
        }
        // 他の emissive マテリアルは控えめに（アンテナ球だけ強発光させたいので）
        if (mat.emissive && mat.emissive.getHex() !== 0x000000) {
          mat.emissiveIntensity = 1
          mat.toneMapped = true
        }
      })

      // アンテナ球: 名前で確定（body_2）+ 高さヒューリスティックでフォールバック
      if (obj.name === ANTENNA_BALL_NAME) {
        antennaMesh = obj
        highestY = Infinity // これ以降の上書きを防ぐ
      } else if (!isEyeMesh && highestY !== Infinity) {
        const box = new THREE.Box3().setFromObject(obj)
        const centerY = (box.min.y + box.max.y) / 2
        if (centerY > highestY) {
          highestY = centerY
          antennaMesh = obj
        }
      }
    })

    // アンテナ球マテリアルと位置を保存
    if (antennaMesh) {
      const mat = Array.isArray((antennaMesh as THREE.Mesh).material)
        ? ((antennaMesh as THREE.Mesh).material as THREE.MeshStandardMaterial[])[0]
        : ((antennaMesh as THREE.Mesh).material as THREE.MeshStandardMaterial)
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.emissiveIntensity = 100
        mat.toneMapped = false
        antennaMatRef.current = mat
      }
      // ワールド座標を取得してポイントライト配置に使う
      const worldPos = new THREE.Vector3()
      ;(antennaMesh as THREE.Mesh).getWorldPosition(worldPos)
      antennaPosRef.current = worldPos
    }
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

  // state別エフェクト + 移動アニメーション
  useFrame((_, delta) => {
    if (!group.current) return

    const vel = velocityRef?.current ?? { vx: 0, vy: 0, speed: 0 }
    const MAX_SPEED = 400
    const MAX_TILT = 0.2

    // 移動状態のステートマシン（ヒステリシス付き）
    const SPEED_START = 30  // この速度を超えたら moving 開始
    const SPEED_STOP = 8    // この速度を下回ったら returning 開始
    if (vel.speed > SPEED_START) {
      phaseRef.current = 'moving'
    } else if (vel.speed < SPEED_STOP && phaseRef.current === 'moving') {
      phaseRef.current = 'returning'
    }

    // === 移動アニメーション（フェーズ別に分離） ===
    if (phaseRef.current === 'moving') {
      // 胴体を進行方向に傾ける
      const targetRotX = -THREE.MathUtils.clamp(vel.vy / MAX_SPEED, -1, 1) * MAX_TILT
      const targetRotZ =  THREE.MathUtils.clamp(vel.vx / MAX_SPEED, -1, 1) * MAX_TILT
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetRotX, 0.08)
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, targetRotZ, 0.08)
      if (feetTiltRef.current) {
        const thrustTiltX =  THREE.MathUtils.clamp(vel.vy / MAX_SPEED, -1, 1) * 0.3
        const thrustTiltZ = -THREE.MathUtils.clamp(vel.vx / MAX_SPEED, -1, 1) * 0.3
        feetTiltRef.current.rotation.x = THREE.MathUtils.lerp(feetTiltRef.current.rotation.x, thrustTiltX, 0.08)
        feetTiltRef.current.rotation.z = THREE.MathUtils.lerp(feetTiltRef.current.rotation.z, thrustTiltZ, 0.08)
      }
    } else if (phaseRef.current === 'returning') {
      // 0に戻す。十分小さくなったら idle に遷移して以降は触らない
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, 0.1)
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, 0.1)
      if (feetTiltRef.current) {
        feetTiltRef.current.rotation.x = THREE.MathUtils.lerp(feetTiltRef.current.rotation.x, 0, 0.1)
        feetTiltRef.current.rotation.z = THREE.MathUtils.lerp(feetTiltRef.current.rotation.z, 0, 0.1)
      }
      const settled =
        Math.abs(group.current.rotation.x) < 0.005 &&
        Math.abs(group.current.rotation.z) < 0.005
      if (settled) {
        group.current.rotation.x = 0
        group.current.rotation.z = 0
        if (feetTiltRef.current) {
          feetTiltRef.current.rotation.x = 0
          feetTiltRef.current.rotation.z = 0
        }
        phaseRef.current = 'idle'
      }
    }
    // idle フェーズ: rotation には一切触らない（Blender アニメが自由に動く）

    // === 状態別アニメーション（速度とは独立、常時動作） ===
    if (state === 'speaking') {
      group.current.position.y = Math.sin(Date.now() * 0.02) * 0.05
    } else {
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0, 0.05)
    }

    // アンテナ球の色を接続状態 × ロボット状態で更新
    const antennaColor = getAntennaColor(isConnected, state)
    if (antennaMatRef.current) {
      antennaMatRef.current.emissive.set(antennaColor)
      antennaMatRef.current.color.set(antennaColor)
      antennaMatRef.current.emissiveIntensity = 100
    }
    if (antennaLightRef.current) {
      antennaLightRef.current.color.set(antennaColor)
    }
  })

  const p = antennaPosRef.current
  return (
    <>
      <primitive ref={group} object={scene} scale={0.6} />
      <pointLight
        ref={antennaLightRef}
        position={[p.x, p.y, p.z]}
        color={getAntennaColor(isConnected, state)}
        intensity={30}
        distance={6}
      />
    </>
  )
}

// ========== Robot content (Suspense を使わず即座に表示) ==========

function RobotContent({
  state,
  isConnected,
  velocityRef,
}: {
  state: RobotState
  isConnected: boolean
  velocityRef?: React.RefObject<Velocity>
}) {
  const [glbReady, setGlbReady] = useState(false)

  return (
    <>
      {/* GLBロード完了まで PlaceholderRobot を即座に表示 */}
      {!glbReady && <PlaceholderRobot state={state} isConnected={isConnected} />}
      <Suspense fallback={null}>
        <GLBRobot
          state={state}
          isConnected={isConnected}
          onReady={() => setGlbReady(true)}
          velocityRef={velocityRef}
        />
      </Suspense>
    </>
  )
}

// ========== Main Scene ==========

export function RobotScene({
  state,
  isConnected,
  velocityRef,
}: {
  state: RobotState
  isConnected: boolean
  velocityRef?: React.RefObject<Velocity>
}) {
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

      <RobotContent state={state} isConnected={isConnected} velocityRef={velocityRef} />

      <EffectComposer>
        <Bloom
          intensity={3}
          luminanceThreshold={10}
          luminanceSmoothing={0.1}
          mipmapBlur
        />
      </EffectComposer>

    </Canvas>
  )
}

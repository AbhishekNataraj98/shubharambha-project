import { View } from 'react-native'

type LogoProps = {
  size?: number
  color?: string
}

export default function Logo({ size = 40, color = '#D85A30' }: LogoProps) {
  const unit = size / 100
  const windowColor = color === '#D85A30' ? '#FFFFFF' : '#D85A30'

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          left: 24 * unit,
          top: 4 * unit,
          width: 52 * unit,
          height: 18 * unit,
          borderLeftWidth: 26 * unit,
          borderRightWidth: 26 * unit,
          borderBottomWidth: 18 * unit,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View style={{ position: 'absolute', left: 32 * unit, top: 22 * unit, width: 36 * unit, height: 18 * unit, borderRadius: 1 * unit, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 42 * unit, top: 30 * unit, width: 16 * unit, height: 10 * unit, borderRadius: 2 * unit, backgroundColor: windowColor, opacity: 0.95 }} />

      <View style={{ position: 'absolute', left: 26 * unit, top: 39 * unit, width: 48 * unit, height: 10 * unit, borderRadius: 2 * unit, backgroundColor: color, opacity: 0.48 }} />
      <View style={{ position: 'absolute', left: 20 * unit, top: 51 * unit, width: 60 * unit, height: 10 * unit, borderRadius: 2 * unit, backgroundColor: color, opacity: 0.64 }} />
      <View style={{ position: 'absolute', left: 14 * unit, top: 64 * unit, width: 72 * unit, height: 11 * unit, borderRadius: 2 * unit, backgroundColor: color, opacity: 0.82 }} />
      <View style={{ position: 'absolute', left: 8 * unit, top: 78 * unit, width: 84 * unit, height: 10 * unit, borderRadius: 2 * unit, backgroundColor: color }} />
    </View>
  )
}

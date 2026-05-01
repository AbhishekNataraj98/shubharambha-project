import { View, Text } from 'react-native'

type Props = {
  rating: number
  size?: number
}

/** Five-star strip with half-star support (filled ★ clipped over faint ☆). */
export function ReviewStarRow({ rating, size = 9 }: Props) {
  const r = Math.min(5, Math.max(0, rating))
  const colW = Math.max(10, Math.round(size * 1.08))

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, r - i))
        return (
          <View
            key={i}
            style={{
              position: 'relative',
              width: colW,
              height: size + 3,
              justifyContent: 'center',
            }}
          >
            <View style={{ position: 'absolute', left: 0 }}>
              <Text style={{ fontSize: size, color: 'rgba(245,158,11,0.38)' }}>☆</Text>
            </View>
            <View style={{ width: colW * fill, overflow: 'hidden' }}>
              <Text style={{ fontSize: size, color: '#F59E0B', width: colW }}>★</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

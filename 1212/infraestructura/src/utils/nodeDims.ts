// src/utils/nodeDims.ts
export type Half = { halfW: number; halfH: number }

export function nodeHalfSize(type: string): Half {
  switch (type) {
    case 'tank':     return { halfW: 60, halfH: 40 } // 120x80
    case 'pump':     return { halfW: 26, halfH: 26 } // círculo r=26
    case 'valve':    return { halfW: 16, halfH: 10 } // 32x20
    case 'manifold': return { halfW: 50, halfH: 8 }  // 100x16
    default:         return { halfW: 24, halfH: 24 }
  }
}

declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'

  function shp(buffer: ArrayBuffer | Buffer): Promise<FeatureCollection | FeatureCollection[]>
  export default shp
}

/**
 * Synthetic 30 km northbound course: 1,000 m climb (km 0-10),
 * descent (km 10-20), then flat section (km 20-30). Two aid stations as waypoints.
 */
export function syntheticCourseGpx(): string {
  const kmPerDegree = 111.195
  const points: string[] = []
  for (let i = 0; i <= 600; i++) {
    const km = i * 0.05
    const ele = km <= 10 ? 500 + km * 100 : km <= 20 ? 1500 - (km - 10) * 100 : 500
    points.push(`<trkpt lat="${(45 + km / kmPerDegree).toFixed(6)}" lon="6.000000"><ele>${ele.toFixed(1)}</ele></trkpt>`)
  }
  const wpt = (km: number, name: string) => `<wpt lat="${(45 + km / kmPerDegree).toFixed(6)}" lon="6.0001"><name>${name}</name></wpt>`
  return `<?xml version="1.0"?><gpx version="1.1" creator="test">${wpt(10, 'Ravito du sommet')}${wpt(20, 'Base de vie')}<trk><name>Trail test 30K</name><trkseg>${points.join('')}</trkseg></trk></gpx>`
}

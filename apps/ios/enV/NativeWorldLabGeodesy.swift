import Foundation

struct NativeGeodetic:Decodable {
    let latitudeDegrees:Double
    let longitudeDegrees:Double
    let heightMeters:Double
}
struct NativeEcef {
    let xMeters:Double
    let yMeters:Double
    let zMeters:Double
}
struct NativeEnu {
    let eastMeters:Double
    let northMeters:Double
    let upMeters:Double
}
enum NativeWorldLabGeodesy {
    static let semiMajorMeters=6378137.0
    static let flattening=1.0/298.257223563
    private static var b:Double{semiMajorMeters*(1-flattening)}
    private static var e2:Double{flattening*(2-flattening)}
    private static var ep2:Double{(semiMajorMeters*semiMajorMeters-b*b)/(b*b)}
    static func validate(_ c:NativeGeodetic)throws->NativeGeodetic {
        guard c.latitudeDegrees.isFinite,(-90...90).contains(c.latitudeDegrees),
              c.longitudeDegrees.isFinite,(-180...180).contains(c.longitudeDegrees),
              c.heightMeters.isFinite,(-12000...1e9).contains(c.heightMeters) else {
            throw NativeWorldLabError.invalid("Geodetic coordinates exceed WGS84 reference input bounds")
        }
        return c
    }
    static func toEcef(_ input:NativeGeodetic)throws->NativeEcef {
        let c=try validate(input),lat=c.latitudeDegrees*Double.pi/180,
            lon=c.longitudeDegrees*Double.pi/180
        let s=sin(lat),n=semiMajorMeters/sqrt(1-e2*s*s)
        return NativeEcef(xMeters:(n+c.heightMeters)*cos(lat)*cos(lon),
            yMeters:(n+c.heightMeters)*cos(lat)*sin(lon),
            zMeters:(n*(1-e2)+c.heightMeters)*s)
    }
    static func fromEcef(_ c:NativeEcef)throws->NativeGeodetic {
        guard c.xMeters.isFinite,c.yMeters.isFinite,c.zMeters.isFinite else {
            throw NativeWorldLabError.invalid("ECEF coordinates must be finite")
        }
        let p=hypot(c.xMeters,c.yMeters)
        guard hypot(p,c.zMeters)>=1 else {
            throw NativeWorldLabError.invalid("Earth-centre has no unique geodetic coordinate")
        }
        if p<1e-9{return NativeGeodetic(latitudeDegrees:c.zMeters>=0 ? 90:-90,
            longitudeDegrees:0,heightMeters:abs(c.zMeters)-b)}
        let lon=atan2(c.yMeters,c.xMeters)
        let theta=atan2(c.zMeters*semiMajorMeters,p*b)
        var lat=atan2(c.zMeters+ep2*b*pow(sin(theta),3),
            p-e2*semiMajorMeters*pow(cos(theta),3))
        var height=0.0
        for _ in 0..<12 {
            let s=sin(lat),n=semiMajorMeters/sqrt(1-e2*s*s)
            height=p/max(1e-15,cos(lat))-n
            let next=atan2(c.zMeters,p*(1-e2*n/(n+height)))
            let delta=abs(next-lat);lat=next
            if delta<1e-14{break}
        }
        let s=sin(lat),n=semiMajorMeters/sqrt(1-e2*s*s)
        height=abs(cos(lat))>1e-8 ? p/cos(lat)-n:abs(c.zMeters)/sin(lat)-n*(1-e2)
        return NativeGeodetic(latitudeDegrees:lat*180/Double.pi,
            longitudeDegrees:lon*180/Double.pi,heightMeters:height)
    }
    static func toEnu(_ point:NativeEcef,origin:NativeGeodetic)throws->NativeEnu {
        let o=try validate(origin),base=try toEcef(o)
        let dx=point.xMeters-base.xMeters,dy=point.yMeters-base.yMeters,dz=point.zMeters-base.zMeters
        guard [dx,dy,dz].allSatisfy({$0.isFinite}) else {
            throw NativeWorldLabError.invalid("ECEF offsets must be finite")
        }
        let lat=o.latitudeDegrees*Double.pi/180,lon=o.longitudeDegrees*Double.pi/180
        let sl=sin(lat),cl=cos(lat),so=sin(lon),co=cos(lon)
        return NativeEnu(eastMeters:-so*dx+co*dy,
            northMeters:-sl*co*dx-sl*so*dy+cl*dz,
            upMeters:cl*co*dx+cl*so*dy+sl*dz)
    }
    static func fromEnu(_ local:NativeEnu,origin:NativeGeodetic)throws->NativeEcef {
        guard [local.eastMeters,local.northMeters,local.upMeters].allSatisfy({$0.isFinite}) else {
            throw NativeWorldLabError.invalid("ENU coordinates must be finite")
        }
        let o=try validate(origin),base=try toEcef(o)
        let lat=o.latitudeDegrees*Double.pi/180,lon=o.longitudeDegrees*Double.pi/180
        let sl=sin(lat),cl=cos(lat),so=sin(lon),co=cos(lon)
        let dx = -so*local.eastMeters-sl*co*local.northMeters+cl*co*local.upMeters
        let dy = co*local.eastMeters-sl*so*local.northMeters+cl*so*local.upMeters
        let dz = cl*local.northMeters+sl*local.upMeters
        return NativeEcef(xMeters:base.xMeters+dx,yMeters:base.yMeters+dy,zMeters:base.zMeters+dz)
    }
}

// MARK: - Display-grade sun position and sky palette for the representative world

struct NativeSolarPosition: Equatable {
    let altitudeDegrees: Double
    let azimuthDegrees: Double
}

/// Colours are 0...1 RGB triples.
struct NativeSkyPalette {
    let zenith: [Double]
    let horizon: [Double]
    let glowStrength: Double
}

struct NativeSkyLighting {
    let ambient: Double
    let sun: Double
    let sunVisible: Bool
}

/// NOAA solar-position equations (no refraction). A visual reference good to about half a degree,
/// not an ephemeris. Axes are east, up, north; the scene converts to SceneKit's handedness.
enum NativeWorldLabSky {
    private static let rad = Double.pi / 180
    private static let deg = 180 / Double.pi

    private static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
        min(high, max(low, value))
    }

    static func solarPosition(epochSeconds: Double, latitudeDegrees: Double, longitudeDegrees: Double) -> NativeSolarPosition {
        let julianDay = epochSeconds / 86_400 + 2_440_587.5
        let t = (julianDay - 2_451_545) / 36_525
        let meanLongitude = (280.46646 + t * (36_000.76983 + t * 0.0003032)).truncatingRemainder(dividingBy: 360)
        let meanLongitudeWrapped = meanLongitude < 0 ? meanLongitude + 360 : meanLongitude
        let meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t)
        let eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
        let m = meanAnomaly * rad
        let centre = sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
            + sin(2 * m) * (0.019993 - 0.000101 * t) + sin(3 * m) * 0.000289
        let trueLongitude = meanLongitudeWrapped + centre
        let omega = 125.04 - 1934.136 * t
        let apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sin(omega * rad)
        let meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
        let obliquity = meanObliquity + 0.00256 * cos(omega * rad)
        let declination = asin(sin(obliquity * rad) * sin(apparentLongitude * rad))
        let y = pow(tan(obliquity * rad / 2), 2)
        let l0 = meanLongitudeWrapped * rad
        let equationOfTimeMinutes = 4 * deg * (
            y * sin(2 * l0) - 2 * eccentricity * sin(m)
            + 4 * eccentricity * y * sin(m) * cos(2 * l0)
            - 0.5 * y * y * sin(4 * l0) - 1.25 * eccentricity * eccentricity * sin(2 * m))
        var daySeconds = epochSeconds.truncatingRemainder(dividingBy: 86_400)
        if daySeconds < 0 { daySeconds += 86_400 }
        let utcMinutes = daySeconds / 60
        var solarMinutes = (utcMinutes + equationOfTimeMinutes + 4 * longitudeDegrees).truncatingRemainder(dividingBy: 1_440)
        if solarMinutes < 0 { solarMinutes += 1_440 }
        var hourAngle = solarMinutes / 4 - 180
        if hourAngle < -180 { hourAngle += 360 }
        let lat = clamp(latitudeDegrees, -90, 90) * rad
        let cosZenith = clamp(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle * rad), -1, 1)
        let zenith = acos(cosZenith)
        let denominator = cos(lat) * sin(zenith)
        var azimuth = 180.0
        if abs(denominator) > 1e-9 {
            let raw = deg * acos(clamp((sin(lat) * cosZenith - sin(declination)) / denominator, -1, 1))
            azimuth = hourAngle > 0 ? (raw + 180).truncatingRemainder(dividingBy: 360) : (540 - raw).truncatingRemainder(dividingBy: 360)
        }
        return NativeSolarPosition(altitudeDegrees: 90 - zenith * deg, azimuthDegrees: azimuth)
    }

    /// Unit vector toward the sun as [east, up, north].
    static func sunDirection(_ position: NativeSolarPosition) -> [Double] {
        let altitude = position.altitudeDegrees * rad
        let azimuth = position.azimuthDegrees * rad
        return [sin(azimuth) * cos(altitude), sin(altitude), cos(azimuth) * cos(altitude)]
    }

    private static let keys: [(altitude: Double, zenith: [Double], horizon: [Double], glow: Double)] = [
        (-18, [0.012, 0.02, 0.06], [0.035, 0.05, 0.11], 0),
        (-6, [0.05, 0.08, 0.2], [0.2, 0.2, 0.34], 0.35),
        (0, [0.2, 0.3, 0.58], [0.96, 0.6, 0.4], 0.85),
        (8, [0.24, 0.46, 0.8], [0.86, 0.8, 0.74], 0.45),
        (25, [0.17, 0.42, 0.82], [0.72, 0.85, 0.96], 0.18),
        (90, [0.15, 0.38, 0.8], [0.7, 0.84, 0.95], 0.1),
    ]

    private static func mix(_ a: [Double], _ b: [Double], _ f: Double) -> [Double] {
        (0..<3).map { a[$0] + (b[$0] - a[$0]) * f }
    }

    static func palette(altitudeDegrees: Double) -> NativeSkyPalette {
        let altitude = clamp(altitudeDegrees, keys[0].altitude, 90)
        var index = 0
        while index < keys.count - 2 && altitude > keys[index + 1].altitude { index += 1 }
        let a = keys[index], b = keys[index + 1]
        let f = clamp((altitude - a.altitude) / (b.altitude - a.altitude), 0, 1)
        return NativeSkyPalette(zenith: mix(a.zenith, b.zenith, f), horizon: mix(a.horizon, b.horizon, f),
                                glowStrength: a.glow + (b.glow - a.glow) * f)
    }

    static func lighting(altitudeDegrees: Double) -> NativeSkyLighting {
        let day = clamp((altitudeDegrees + 4) / 16, 0, 1)
        let twilight = clamp((altitudeDegrees + 18) / 14, 0, 1)
        return NativeSkyLighting(ambient: 0.12 + 0.12 * twilight + 0.61 * day, sun: 0.65 * day, sunVisible: altitudeDegrees > -2)
    }

    /// The representative site sits on the equator; longitude is chosen so the device clock reads local solar time.
    static func representativeLongitude(timezoneOffsetSeconds: Int) -> Double {
        Double(timezoneOffsetSeconds) / 3_600 * 15
    }
}

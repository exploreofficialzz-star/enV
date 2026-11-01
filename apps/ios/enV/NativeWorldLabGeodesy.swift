import Foundation

struct NativeGeodetic {
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

import Foundation
struct NativeWorldLabDemoCheckpoint:Codable,Equatable {
    let format:String
    let schemaVersion:Int
    let modelVersion:String
    let modelId:String
    let timeSeconds:Double
    let massKg:Double
    let springNPerM:Double
    let resistanceOhm:Double
    let diffusivityM2PerS:Double
    static let formatName="env-world-lab-native-demo-checkpoint"
    static func make(modelId:String,timeSeconds:Double,massKg:Double,
        springNPerM:Double,resistanceOhm:Double,diffusivityM2PerS:Double)throws->Self {
        let value=Self(format:formatName,schemaVersion:1,modelVersion:"1.0.0",
            modelId:modelId,timeSeconds:timeSeconds,massKg:massKg,
            springNPerM:springNPerM,resistanceOhm:resistanceOhm,
            diffusivityM2PerS:diffusivityM2PerS)
        try value.validate()
        return value
    }
    func validate()throws {
        guard format==Self.formatName,schemaVersion==1,modelVersion=="1.0.0",
            ["spring","rc","heat"].contains(modelId),
            timeSeconds.isFinite,(0...12).contains(timeSeconds),
            massKg.isFinite,(0.1...100).contains(massKg),
            springNPerM.isFinite,(0.1...30).contains(springNPerM),
            resistanceOhm.isFinite,(100...10000).contains(resistanceOhm),
            diffusivityM2PerS.isFinite,(0.001...0.08).contains(diffusivityM2PerS) else {
            throw NativeWorldLabError.invalid("Timeline checkpoint version, model or parameter bounds are invalid")
        }
    }
    func encodeBounded()throws->Data {
        try validate()
        let data=try JSONEncoder().encode(self)
        guard data.count<=16*1024 else {throw NativeWorldLabError.invalid("Timeline checkpoint exceeds 16 KB")}
        return data
    }
    static func decodeBounded(_ data:Data)throws->Self {
        guard data.count<=16*1024 else {throw NativeWorldLabError.invalid("Timeline checkpoint exceeds 16 KB")}
        let value=try JSONDecoder().decode(Self.self,from:data)
        try value.validate()
        return value
    }
}
enum NativeWorldLabTime {
    static func previousEvent(current:Double,duration:Double,events:[Double])->Double {
        guard current.isFinite,duration.isFinite,duration>0,current>=0,current<=duration else{return 0}
        return events.filter{$0.isFinite && $0>=0 && $0<current-1e-9}.max() ?? 0
    }
    static func nextEvent(current:Double,duration:Double,events:[Double])->Double {
        guard current.isFinite,duration.isFinite,duration>0,current>=0,current<=duration else{return current}
        return events.filter{$0.isFinite && $0>current+1e-9 && $0<=duration}.min() ?? duration
    }

    static func next(current:Double,elapsed:Double,rate:Double,duration:Double,
                     events:[Double])->Double {
        guard current.isFinite,elapsed.isFinite,rate.isFinite,duration.isFinite,
              duration>0,current>=0,current<=duration,elapsed>=0,elapsed<=60,
              rate>=0.01,rate<=100 else{return current}
        let candidate=min(duration,current+elapsed*rate)
        if let next=events.filter({$0.isFinite && $0>current+1e-9 && $0<=duration})
            .min(),next<candidate-1e-9{return next}
        return candidate
    }
}

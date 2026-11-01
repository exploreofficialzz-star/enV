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
    let wallTimeUTC:String?
    let worldEpochUTC:String?
    let solverInternalTimeSeconds:Double?
    let displaySampleTimeSeconds:Double?
    let playbackRate:Double?
    let playbackDirection:String?
    let timezoneDisplay:String?
    let solverStepSeconds:Double?
    static let formatName="env-world-lab-native-demo-checkpoint"
    static func make(modelId:String,timeSeconds:Double,massKg:Double,
        springNPerM:Double,resistanceOhm:Double,diffusivityM2PerS:Double,
        wallTimeUTC:String?=nil,worldEpochUTC:String?=nil,
        solverInternalTimeSeconds:Double?=nil,displaySampleTimeSeconds:Double?=nil,
        playbackRate:Double?=nil,playbackDirection:String?=nil,timezoneDisplay:String?=nil,
        solverStepSeconds:Double?=nil)throws->Self {
        let present=[wallTimeUTC != nil,worldEpochUTC != nil,solverInternalTimeSeconds != nil,
            displaySampleTimeSeconds != nil,playbackRate != nil,playbackDirection != nil,timezoneDisplay != nil]
        guard present.allSatisfy({$0}) || present.allSatisfy({!$0}) else {
            throw NativeWorldLabError.invalid("Clock checkpoint fields must be all present or all absent")
        }
        let version=present.allSatisfy({$0}) ? (solverStepSeconds == nil ? 2:3):1
        let value=Self(format:formatName,schemaVersion:version,modelVersion:"1.0.0",
            modelId:modelId,timeSeconds:timeSeconds,massKg:massKg,springNPerM:springNPerM,
            resistanceOhm:resistanceOhm,diffusivityM2PerS:diffusivityM2PerS,
            wallTimeUTC:wallTimeUTC,worldEpochUTC:worldEpochUTC,
            solverInternalTimeSeconds:solverInternalTimeSeconds,displaySampleTimeSeconds:displaySampleTimeSeconds,
            playbackRate:playbackRate,playbackDirection:playbackDirection,timezoneDisplay:timezoneDisplay,
            solverStepSeconds:solverStepSeconds)
        try value.validate();return value
    }
    func validate()throws {
        guard format==Self.formatName,(1...3).contains(schemaVersion),modelVersion=="1.0.0",
            ["spring","rc","heat"].contains(modelId),timeSeconds.isFinite,(0...12).contains(timeSeconds),
            massKg.isFinite,(0.1...100).contains(massKg),springNPerM.isFinite,(0.1...30).contains(springNPerM),
            resistanceOhm.isFinite,(100...10000).contains(resistanceOhm),
            diffusivityM2PerS.isFinite,(0.001...0.08).contains(diffusivityM2PerS) else {
            throw NativeWorldLabError.invalid("Timeline checkpoint version, model or parameter bounds are invalid")
        }
        if schemaVersion>=2 {
            guard let wallTimeUTC,let worldEpochUTC,let solverInternalTimeSeconds,
                let displaySampleTimeSeconds,let playbackRate,let playbackDirection,let timezoneDisplay,
                wallTimeUTC.hasSuffix("Z"),worldEpochUTC.hasSuffix("Z"),
                ISO8601DateFormatter().date(from:wallTimeUTC) != nil,
                ISO8601DateFormatter().date(from:worldEpochUTC) != nil,
                solverInternalTimeSeconds.isFinite,(0...12).contains(solverInternalTimeSeconds),
                displaySampleTimeSeconds.isFinite,(0...12).contains(displaySampleTimeSeconds),
                playbackRate.isFinite,(0.01...100).contains(playbackRate),
                ["forward","reverse-recording"].contains(playbackDirection),
                TimeZone(identifier:timezoneDisplay) != nil,
                (schemaVersion<3 || (solverStepSeconds?.isFinite == true && (1e-9...12).contains(solverStepSeconds!))) else {
                throw NativeWorldLabError.invalid("Timeline clock checkpoint fields are invalid")
            }
        } else if [wallTimeUTC,worldEpochUTC,solverInternalTimeSeconds.map(String.init),
            displaySampleTimeSeconds.map(String.init),playbackRate.map(String.init),solverStepSeconds.map(String.init),
            playbackDirection,timezoneDisplay].contains(where:{$0 != nil}) {
            throw NativeWorldLabError.invalid("Version 1 checkpoints cannot contain clock extensions")
        }
    }
    func encodeBounded()throws->Data {
        try validate()
        let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        let data=try encoder.encode(self)
        guard data.count<=16*1024 else{throw NativeWorldLabError.invalid("Timeline checkpoint exceeds 16 KB")}
        return data
    }
    static func decodeBounded(_ data:Data)throws->Self {
        guard data.count<=16*1024 else{throw NativeWorldLabError.invalid("Timeline checkpoint exceeds 16 KB")}
        let value=try JSONDecoder().decode(Self.self,from:data);try value.validate();return value
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
    /** Reverse only traverses cached recording time; it does not integrate physics backward. */
    static func previous(current:Double,elapsed:Double,rate:Double,duration:Double,
                         events:[Double])->Double {
        guard current.isFinite,elapsed.isFinite,rate.isFinite,duration.isFinite,
              duration>0,current>=0,current<=duration,elapsed>=0,elapsed<=60,
              rate>=0.01,rate<=100 else{return current}
        let candidate=max(0,current-elapsed*rate)
        if let previous=events.filter({$0.isFinite && $0>=0 && $0<current-1e-9 && $0<=duration})
            .max(),previous>candidate+1e-9{return previous}
        return candidate
    }
    static func advance(current:Double,elapsed:Double,rate:Double,duration:Double,
                        events:[Double],reverse:Bool)->Double {
        reverse ? previous(current:current,elapsed:elapsed,rate:rate,duration:duration,events:events)
                : next(current:current,elapsed:elapsed,rate:rate,duration:duration,events:events)
    }
}

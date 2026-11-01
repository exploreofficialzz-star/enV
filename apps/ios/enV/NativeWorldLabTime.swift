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


/// Immutable metadata for a native, already-computed solver recording.
struct NativeWorldLabRecordedRun:Equatable {
    let runId:String
    let modelId:String
    let modelVersion:String
    let worldEpochUTC:String
    let sampleTimesSeconds:[Double]
    let mandatoryEventTimesSeconds:[Double]
    init(runId:String,modelId:String,modelVersion:String,worldEpochUTC:String,
         sampleTimesSeconds:[Double],mandatoryEventTimesSeconds:[Double]=[]) {
        self.runId=runId;self.modelId=modelId;self.modelVersion=modelVersion
        self.worldEpochUTC=worldEpochUTC;self.sampleTimesSeconds=sampleTimesSeconds
        self.mandatoryEventTimesSeconds=mandatoryEventTimesSeconds
    }
    var durationSeconds:Double { sampleTimesSeconds.last ?? 0 }
    func validate()throws {
        guard !runId.isEmpty,runId.count<=160,!modelId.isEmpty,modelId.count<=120,
              !modelVersion.isEmpty,modelVersion.count<=80,
              worldEpochUTC.hasSuffix("Z"),NativeWorldLabRecordedTime.parseUTC(worldEpochUTC) != nil,
              (2...200_000).contains(sampleTimesSeconds.count),durationSeconds<=315_576_000,
              sampleTimesSeconds.allSatisfy({$0.isFinite && $0>=0}),
              zip(sampleTimesSeconds,sampleTimesSeconds.dropFirst()).allSatisfy({$0.1>$0.0}),
              mandatoryEventTimesSeconds.count<=100_000,
              mandatoryEventTimesSeconds.allSatisfy({event in
                  event.isFinite && event>=0 && event<=durationSeconds
              }) else {
            throw NativeWorldLabError.invalid(
                "Recorded run identity, UTC epoch, samples or mandatory event times are invalid.")
        }
    }
}

struct NativeWorldLabRecordedClock:Codable,Equatable {
    let wallTimeUTC:String
    let worldDateUTC:String
    let simulationTimeSeconds:Double
    let solverInternalTimeSeconds:Double?
    let displaySampleTimeSeconds:Double
    let sampleIndex:Int
    let playbackRate:Double
    let direction:String
    let paused:Bool
    let timezoneDisplay:String
    let fidelity:String
    private enum CodingKeys:String,CodingKey {
        case wallTimeUTC,worldDateUTC,simulationTimeSeconds,solverInternalTimeSeconds
        case displaySampleTimeSeconds,sampleIndex,playbackRate,direction,paused,timezoneDisplay,fidelity
    }
    func encode(to encoder:Encoder)throws {
        var container=encoder.container(keyedBy:CodingKeys.self)
        try container.encode(wallTimeUTC,forKey:.wallTimeUTC)
        try container.encode(worldDateUTC,forKey:.worldDateUTC)
        try container.encode(simulationTimeSeconds,forKey:.simulationTimeSeconds)
        if let internalTime=solverInternalTimeSeconds {
            try container.encode(internalTime,forKey:.solverInternalTimeSeconds)
        } else {
            try container.encodeNil(forKey:.solverInternalTimeSeconds)
        }
        try container.encode(displaySampleTimeSeconds,forKey:.displaySampleTimeSeconds)
        try container.encode(sampleIndex,forKey:.sampleIndex)
        try container.encode(playbackRate,forKey:.playbackRate)
        try container.encode(direction,forKey:.direction)
        try container.encode(paused,forKey:.paused)
        try container.encode(timezoneDisplay,forKey:.timezoneDisplay)
        try container.encode(fidelity,forKey:.fidelity)
    }
}

struct NativeWorldLabRecordedCheckpoint:Codable,Equatable {
    let format:String
    let schemaVersion:Int
    let runId:String
    let modelId:String
    let modelVersion:String
    let worldEpochUTC:String
    let sampleIndex:Int
    let sampleTimeSeconds:Double
    let clock:NativeWorldLabRecordedClock
    init(runId:String,modelId:String,modelVersion:String,worldEpochUTC:String,
         sampleIndex:Int,sampleTimeSeconds:Double,clock:NativeWorldLabRecordedClock) {
        format="env-world-lab-recorded-clock";schemaVersion=1
        self.runId=runId;self.modelId=modelId;self.modelVersion=modelVersion
        self.worldEpochUTC=worldEpochUTC;self.sampleIndex=sampleIndex
        self.sampleTimeSeconds=sampleTimeSeconds;self.clock=clock
    }
    func validate(run:NativeWorldLabRecordedRun)throws {
        try run.validate()
        guard format=="env-world-lab-recorded-clock",schemaVersion==1,
              runId==run.runId,modelId==run.modelId,modelVersion==run.modelVersion,
              worldEpochUTC==run.worldEpochUTC,
              run.sampleTimesSeconds.indices.contains(sampleIndex),
              abs(sampleTimeSeconds-run.sampleTimesSeconds[sampleIndex])<=1e-9,
              try NativeWorldLabRecordedTime.nearestIndex(run:run,timeSeconds:clock.simulationTimeSeconds)==sampleIndex,
              clock.sampleIndex==sampleIndex,
              abs(clock.displaySampleTimeSeconds-sampleTimeSeconds)<=1e-9 else {
            throw NativeWorldLabError.invalid(
                "Checkpoint belongs to a different run or does not identify the exact recorded sample.")
        }
        try NativeWorldLabRecordedTime.validate(clock:clock,run:run)
    }
    func encodeBounded()throws->Data {
        let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        let data=try encoder.encode(self)
        guard data.count<=16*1024 else {
            throw NativeWorldLabError.invalid("Recorded timeline checkpoint exceeds 16 KB.")
        }
        return data
    }
    static func decodeBounded(_ data:Data)throws->Self {
        guard data.count<=16*1024 else {
            throw NativeWorldLabError.invalid("Recorded timeline checkpoint exceeds 16 KB.")
        }
        let rootKeys:Set<String>=["format","schemaVersion","runId","modelId","modelVersion",
            "worldEpochUTC","sampleIndex","sampleTimeSeconds","clock"]
        let clockKeys:Set<String>=["wallTimeUTC","worldDateUTC","simulationTimeSeconds",
            "solverInternalTimeSeconds","displaySampleTimeSeconds","sampleIndex",
            "playbackRate","direction","paused","timezoneDisplay","fidelity"]
        guard let root=try JSONSerialization.jsonObject(with:data) as? [String:Any],
              Set(root.keys)==rootKeys,
              root["format"] as? String=="env-world-lab-recorded-clock",
              root["schemaVersion"] as? Int==1,
              let clock=root["clock"] as? [String:Any],
              Set(clock.keys)==clockKeys else {
            throw NativeWorldLabError.invalid("Recorded checkpoint has missing, unknown or unsupported fields.")
        }
        return try JSONDecoder().decode(Self.self,from:data)
    }
}

enum NativeWorldLabRecordedTime {
    static let epsilon=1e-9
    static func parseUTC(_ value:String)->Date? {
        guard value.hasSuffix("Z") else{return nil}
        let fractional=ISO8601DateFormatter()
        fractional.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return fractional.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
    private static func formatUTC(_ value:Date)->String {
        let formatter=ISO8601DateFormatter()
        formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return formatter.string(from:value)
    }
    static func nearestIndex(run:NativeWorldLabRecordedRun,timeSeconds:Double)throws->Int {
        try run.validate()
        guard timeSeconds.isFinite,(0...run.durationSeconds).contains(timeSeconds) else {
            throw NativeWorldLabError.invalid("Seek time is outside the immutable recording.")
        }
        return run.sampleTimesSeconds.indices.min(by:{
            abs(run.sampleTimesSeconds[$0]-timeSeconds)<abs(run.sampleTimesSeconds[$1]-timeSeconds)
        }) ?? 0
    }
    static func validate(clock:NativeWorldLabRecordedClock,run:NativeWorldLabRecordedRun)throws {
        guard clock.wallTimeUTC.hasSuffix("Z"),clock.worldDateUTC.hasSuffix("Z"),
              let wall=parseUTC(clock.wallTimeUTC),
              let world=parseUTC(clock.worldDateUTC),
              clock.simulationTimeSeconds.isFinite,
              (0...run.durationSeconds).contains(clock.simulationTimeSeconds),
              run.sampleTimesSeconds.indices.contains(clock.sampleIndex),
              abs(clock.displaySampleTimeSeconds-run.sampleTimesSeconds[clock.sampleIndex])<=epsilon,
              try nearestIndex(run:run,timeSeconds:clock.simulationTimeSeconds)==clock.sampleIndex,
              clock.solverInternalTimeSeconds == nil ||
                (clock.solverInternalTimeSeconds!.isFinite && clock.solverInternalTimeSeconds!>=0),
              clock.playbackRate.isFinite,(0.01...100).contains(clock.playbackRate),
              ["forward","reverse-recording"].contains(clock.direction),
              clock.timezoneDisplay.count<=100,TimeZone(identifier:clock.timezoneDisplay) != nil,
              clock.fidelity=="recorded-sample-playback" else {
            throw NativeWorldLabError.invalid("Recorded playback clock fields are inconsistent or out of bounds.")
        }
        _ = wall
        let epoch=parseUTC(run.worldEpochUTC)!
        let expected=epoch.addingTimeInterval(clock.simulationTimeSeconds)
        guard abs(expected.timeIntervalSince(world))<=0.001 else {
            throw NativeWorldLabError.invalid("World date does not agree with recorded simulation time.")
        }
    }
    static func start(run:NativeWorldLabRecordedRun,wallTimeUTC:String,
        timezoneDisplay:String,playbackRate:Double=1,direction:String="forward")throws->NativeWorldLabRecordedClock {
        try run.validate()
        let state=NativeWorldLabRecordedClock(wallTimeUTC:wallTimeUTC,
            worldDateUTC:run.worldEpochUTC,simulationTimeSeconds:0,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:run.sampleTimesSeconds[0],
            sampleIndex:0,playbackRate:playbackRate,direction:direction,paused:true,
            timezoneDisplay:timezoneDisplay,fidelity:"recorded-sample-playback")
        try validate(clock:state,run:run)
        return state
    }
    static func advance(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        elapsedSeconds:Double,paused:Bool?=nil)throws->NativeWorldLabRecordedClock {
        try run.validate();try validate(clock:state,run:run)
        guard elapsedSeconds.isFinite,(0...60).contains(elapsedSeconds),
              let wall=parseUTC(state.wallTimeUTC) else {
            throw NativeWorldLabError.invalid("Elapsed wall time or wall clock is invalid.")
        }
        let wallString=formatUTC(wall.addingTimeInterval(elapsedSeconds))
        if paused ?? state.paused {
            let result=NativeWorldLabRecordedClock(wallTimeUTC:wallString,worldDateUTC:state.worldDateUTC,
                simulationTimeSeconds:state.simulationTimeSeconds,solverInternalTimeSeconds:nil,
                displaySampleTimeSeconds:state.displaySampleTimeSeconds,sampleIndex:state.sampleIndex,
                playbackRate:state.playbackRate,direction:state.direction,paused:true,
                timezoneDisplay:state.timezoneDisplay,fidelity:"recorded-sample-playback")
            try validate(clock:result,run:run);return result
        }
        let signed=elapsedSeconds*state.playbackRate*(state.direction=="reverse-recording" ? -1:1)
        var next=min(run.durationSeconds,max(0,state.simulationTimeSeconds+signed))
        let crossed=run.mandatoryEventTimesSeconds.filter{event in
            signed>0 ? event>state.simulationTimeSeconds+epsilon && event<=next+epsilon :
            signed<0 ? event<state.simulationTimeSeconds-epsilon && event>=next-epsilon : false
        }
        if !crossed.isEmpty {next=signed>0 ? crossed.min()!:crossed.max()!}
        let index=try nearestIndex(run:run,timeSeconds:next)
        let sample=run.sampleTimesSeconds[index]
        let epoch=parseUTC(run.worldEpochUTC)!
        let world=formatUTC(epoch.addingTimeInterval(next))
        let result=NativeWorldLabRecordedClock(wallTimeUTC:wallString,worldDateUTC:world,
            simulationTimeSeconds:next,solverInternalTimeSeconds:nil,
            displaySampleTimeSeconds:sample,sampleIndex:index,playbackRate:state.playbackRate,
            direction:state.direction,paused:false,timezoneDisplay:state.timezoneDisplay,
            fidelity:"recorded-sample-playback")
        try validate(clock:result,run:run);return result
    }
    static func seek(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        timeSeconds:Double)throws->NativeWorldLabRecordedClock {
        try run.validate();try validate(clock:state,run:run)
        let index=try nearestIndex(run:run,timeSeconds:timeSeconds)
        let sample=run.sampleTimesSeconds[index]
        let epoch=parseUTC(run.worldEpochUTC)!
        let world=formatUTC(epoch.addingTimeInterval(sample))
        let result=NativeWorldLabRecordedClock(wallTimeUTC:state.wallTimeUTC,
            worldDateUTC:world,simulationTimeSeconds:sample,solverInternalTimeSeconds:nil,
            displaySampleTimeSeconds:sample,sampleIndex:index,playbackRate:state.playbackRate,
            direction:state.direction,paused:true,timezoneDisplay:state.timezoneDisplay,
            fidelity:"recorded-sample-playback")
        try validate(clock:result,run:run);return result
    }
    static func step(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        direction:Int)throws->NativeWorldLabRecordedClock {
        guard direction==1 || direction == -1 else {
            throw NativeWorldLabError.invalid("Recorded step direction must be +1 or -1.")
        }
        let index=min(run.sampleTimesSeconds.count-1,max(0,state.sampleIndex+direction))
        return try seek(run:run,state:state,timeSeconds:run.sampleTimesSeconds[index])
    }
    static func checkpoint(run:NativeWorldLabRecordedRun,
        state:NativeWorldLabRecordedClock)throws->NativeWorldLabRecordedCheckpoint {
        try validate(clock:state,run:run)
        let result=NativeWorldLabRecordedCheckpoint(runId:run.runId,modelId:run.modelId,
            modelVersion:run.modelVersion,worldEpochUTC:run.worldEpochUTC,
            sampleIndex:state.sampleIndex,sampleTimeSeconds:state.displaySampleTimeSeconds,clock:state)
        try result.validate(run:run);return result
    }
    static func restore(run:NativeWorldLabRecordedRun,
        checkpoint:NativeWorldLabRecordedCheckpoint)throws->NativeWorldLabRecordedClock {
        try checkpoint.validate(run:run)
        let clock=checkpoint.clock
        let restored=NativeWorldLabRecordedClock(wallTimeUTC:clock.wallTimeUTC,
            worldDateUTC:clock.worldDateUTC,simulationTimeSeconds:clock.simulationTimeSeconds,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:clock.displaySampleTimeSeconds,
            sampleIndex:clock.sampleIndex,playbackRate:clock.playbackRate,direction:clock.direction,
            paused:true,timezoneDisplay:clock.timezoneDisplay,fidelity:"recorded-sample-playback")
        try validate(clock:restored,run:run);return restored
    }
}

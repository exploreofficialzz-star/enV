import Foundation
import CoreFoundation
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
        guard format==Self.formatName else {
            throw NativeWorldLabError.invalid("Timeline checkpoint format is unsupported")
        }
        guard (1...3).contains(schemaVersion),modelVersion=="1.0.0" else {
            throw NativeWorldLabError.invalid("Timeline checkpoint schema or model version is unsupported")
        }
        guard ["spring","rc","heat"].contains(modelId),
              timeSeconds.isFinite,(0...12).contains(timeSeconds),
              massKg.isFinite,(0.1...100).contains(massKg),
              springNPerM.isFinite,(0.1...30).contains(springNPerM),
              resistanceOhm.isFinite,(100...10000).contains(resistanceOhm),
              diffusivityM2PerS.isFinite,(0.001...0.08).contains(diffusivityM2PerS) else {
            throw NativeWorldLabError.invalid("Timeline checkpoint model or parameter bounds are invalid")
        }
        if schemaVersion==1 {
            let hasClockExtension = wallTimeUTC != nil || worldEpochUTC != nil ||
                solverInternalTimeSeconds != nil || displaySampleTimeSeconds != nil ||
                playbackRate != nil || playbackDirection != nil || timezoneDisplay != nil ||
                solverStepSeconds != nil
            guard !hasClockExtension else {
                throw NativeWorldLabError.invalid("Version 1 checkpoints cannot contain clock extensions")
            }
            return
        }
        guard let wall=wallTimeUTC,let epoch=worldEpochUTC,
              let solverTime=solverInternalTimeSeconds,let displayTime=displaySampleTimeSeconds,
              let rate=playbackRate,let direction=playbackDirection,let timezone=timezoneDisplay else {
            throw NativeWorldLabError.invalid("Timeline clock checkpoint fields are incomplete")
        }
        guard wall.hasSuffix("Z"),epoch.hasSuffix("Z") else {
            throw NativeWorldLabError.invalid("Timeline checkpoint timestamps must use UTC Z notation")
        }
        let wallDate=ISO8601DateFormatter().date(from:wall)
        let epochDate=ISO8601DateFormatter().date(from:epoch)
        guard wallDate != nil,epochDate != nil else {
            throw NativeWorldLabError.invalid("Timeline checkpoint timestamps must be valid ISO 8601 UTC values")
        }
        guard solverTime.isFinite,(0...12).contains(solverTime),
              displayTime.isFinite,(0...12).contains(displayTime) else {
            throw NativeWorldLabError.invalid("Timeline solver and display times are outside their supported bounds")
        }
        guard rate.isFinite,(0.01...100).contains(rate),
              direction=="forward" || direction=="reverse-recording" else {
            throw NativeWorldLabError.invalid("Timeline playback rate or direction is unsupported")
        }
        guard TimeZone(identifier:timezone) != nil else {
            throw NativeWorldLabError.invalid("Timeline display timezone is unsupported")
        }
        if schemaVersion==3 {
            guard let step=solverStepSeconds,step.isFinite,(1e-9...12).contains(step) else {
                throw NativeWorldLabError.invalid("Timeline checkpoint solver step is invalid")
            }
        } else if solverStepSeconds != nil {
            throw NativeWorldLabError.invalid("Version 2 checkpoints cannot contain a solver-step extension")
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


enum NativeWorldLabSolarStatus:String,Codable {
    case normal
    case polarDay
    case polarNight
}
struct NativeWorldLabSolarEvents:Equatable {
    let dateUTC:String
    let latitudeDegrees:Double
    let longitudeDegrees:Double
    let status:NativeWorldLabSolarStatus
    let solarNoonUTC:Date
    let sunriseUTC:Date?
    let sunsetUTC:Date?
    let daylightMinutes:Double?
    let method:String
    let horizonZenithDegrees:Double
    let timeBasis:String
    let validity:String

    static func calculate(dateUTC:String,latitudeDegrees:Double,
        longitudeDegrees:Double)throws->NativeWorldLabSolarEvents {
        let parts=dateUTC.split(separator:"-",omittingEmptySubsequences:false)
        guard parts.count==3,parts.allSatisfy({$0.count==2 || $0.count==4}),
              let year=Int(parts[0]),let month=Int(parts[1]),let day=Int(parts[2]) else {
            throw NativeWorldLabError.invalid("Solar date must use YYYY-MM-DD UTC form.")
        }
        guard (1800...2100).contains(year) else {
            throw NativeWorldLabError.invalid("Solar approximation is supported only from 1800 through 2100.")
        }
        guard latitudeDegrees.isFinite,(-90...90).contains(latitudeDegrees) else {
            throw NativeWorldLabError.invalid("Solar latitude must be finite and between -90° and 90°.")
        }
        guard longitudeDegrees.isFinite,(-180...180).contains(longitudeDegrees) else {
            throw NativeWorldLabError.invalid("Solar longitude must be finite and between -180° and 180°.")
        }
        var calendar=Calendar(identifier:.gregorian)
        calendar.timeZone=TimeZone(secondsFromGMT:0)!
        var components=DateComponents()
        components.year=year;components.month=month;components.day=day
        components.hour=0;components.minute=0;components.second=0
        guard let start=calendar.date(from:components),
              calendar.component(.year,from:start)==year,
              calendar.component(.month,from:start)==month,
              calendar.component(.day,from:start)==day else {
            throw NativeWorldLabError.invalid("Solar date is not a valid Gregorian calendar day.")
        }
        let dayOfYear=calendar.ordinality(of:.day,in:.year,for:start) ?? 1
        let yearLength=Double(calendar.range(of:.day,in:.year,for:start)?.count ?? 365)
        let gamma=2*Double.pi/yearLength*Double(dayOfYear-1)
        let equationOfTimeTerms:[Double] = [
            0.000075,
            0.001868*cos(gamma),
            -0.032077*sin(gamma),
            -0.014615*cos(2*gamma),
            -0.040849*sin(2*gamma)
        ]
        let equationOfTime:Double = 229.18*equationOfTimeTerms.reduce(0,+)
        let declinationTerms:[Double] = [
            0.006918,
            -0.399912*cos(gamma),
            0.070257*sin(gamma),
            -0.006758*cos(2*gamma),
            0.000907*sin(2*gamma),
            -0.002697*cos(3*gamma),
            0.00148*sin(3*gamma)
        ]
        let declination:Double = declinationTerms.reduce(0,+)
        let latitude=latitudeDegrees*Double.pi/180
        let zenith=90.833*Double.pi/180
        let noonMinutes=720-4*longitudeDegrees-equationOfTime
        guard noonMinutes.isFinite,declination.isFinite else {
            throw NativeWorldLabError.invalid("Solar position exceeded the supported numerical range.")
        }
        let noon=start.addingTimeInterval(noonMinutes*60)
        var status:NativeWorldLabSolarStatus = .normal
        var sunrise:Date?
        var sunset:Date?
        var daylight:Double?
        let cosineLatitude=cos(latitude)
        if abs(cosineLatitude)<1e-12 {
            let declinationDegrees=declination*180/Double.pi
            let polarAltitude=latitudeDegrees>0 ? declinationDegrees : -declinationDegrees
            status=polarAltitude > -0.833 ? .polarDay : .polarNight
        } else {
            let denominator=cosineLatitude*cos(declination)
            let cosHour=cos(zenith)/denominator-tan(latitude)*tan(declination)
            guard cosHour.isFinite else {
                throw NativeWorldLabError.invalid("Solar position exceeded the supported numerical range.")
            }
            if cosHour > 1+1e-12 {
                status = .polarNight
            } else if cosHour < -1-1e-12 {
                status = .polarDay
            } else {
                let hourAngle=acos(min(1,max(-1,cosHour)))*180/Double.pi
                let riseMinutes:Double = noonMinutes - 4.0*hourAngle
                let setMinutes:Double = noonMinutes + 4.0*hourAngle
                sunrise=start.addingTimeInterval(riseMinutes*60)
                sunset=start.addingTimeInterval(setMinutes*60)
                daylight = setMinutes - riseMinutes
            }
        }
        return NativeWorldLabSolarEvents(dateUTC:dateUTC,latitudeDegrees:latitudeDegrees,
            longitudeDegrees:longitudeDegrees,status:status,solarNoonUTC:noon,
            sunriseUTC:sunrise,sunsetUTC:sunset,daylightMinutes:daylight,
            method:"NOAA-general-solar-position-equations",horizonZenithDegrees:90.833,
            timeBasis:"UTC civil date; no UT1/TT conversion",
            validity:"Approximate apparent sunrise/sunset for 1800–2100 using a standard 0.833° horizon correction; terrain, elevation horizon, weather, pressure, measured solar data, Earth-orientation parameters, leap seconds and precision ephemerides are not included.")
    }
}


enum NativeWorldLabEarthOrientationQuality:String,Codable {
    case observed
    case predicted
}
struct NativeWorldLabEarthOrientationSample:Equatable,Codable {
    let utcDay:String
    let mjd:Int
    let dut1Seconds:Double
    let uncertaintySeconds:Double
    let quality:NativeWorldLabEarthOrientationQuality
}
struct NativeWorldLabEarthOrientationSeries:Equatable,Codable {
    let format:String
    let schemaVersion:Int
    let source:String
    let volume:String
    let number:Int
    let issuedDateUTC:String
    let algorithm:String
    let samples:[NativeWorldLabEarthOrientationSample]

    init(volume:String,number:Int,issuedDateUTC:String,algorithm:String,
         samples:[NativeWorldLabEarthOrientationSample])throws {
        self.format="env-iers-bulletin-a-series";self.schemaVersion=1
        self.source="IERS Bulletin A";self.volume=volume;self.number=number
        self.issuedDateUTC=issuedDateUTC;self.algorithm=algorithm;self.samples=samples
        try validate()
    }
    func validate()throws {
        guard format=="env-iers-bulletin-a-series",schemaVersion==1,
              source=="IERS Bulletin A",!volume.isEmpty,volume.count<=12,
              (1...999).contains(number),samples.count>=2,samples.count<=2000 else {
            throw NativeWorldLabError.invalid("IERS Earth-orientation series format or bounds are invalid.")
        }
        for (index,row) in samples.enumerated() {
            let date=try NativeWorldLabTimeScales.parseDay(row.utcDay)
            let mjd=Int(floor(date.timeIntervalSince1970/86400))+40587
            guard mjd==row.mjd,row.dut1Seconds.isFinite,abs(row.dut1Seconds)<=1,
                  row.uncertaintySeconds.isFinite,(0...1).contains(row.uncertaintySeconds) else {
                throw NativeWorldLabError.invalid("IERS Earth-orientation sample is invalid.")
            }
            if index>0, samples[index-1].mjd+1 != row.mjd {
                throw NativeWorldLabError.invalid("IERS Earth-orientation samples must be daily and consecutive.")
            }
        }
    }
    var validFromUTC:String { (samples.first?.utcDay ?? "")+"T00:00:00Z" }
    var validThroughUTC:String { (samples.last?.utcDay ?? "")+"T00:00:00Z" }
}
struct NativeWorldLabTimeScaleReading:Equatable {
    let utc:String
    let tai:String
    let tt:String
    let ut1:String?
    let taiMinusUtcSeconds:Int
    let ttMinusUtcSeconds:Double
    let dut1Seconds:Double?
    let ut1UncertaintySeconds:Double?
    let quality:NativeWorldLabEarthOrientationQuality?
    let source:String
    let bulletin:String?
    let issuedDateUTC:String?
}
struct NativeWorldLabTcgReading:Equatable {
    let utc:String
    let tt:String
    let tcg:String
    let ttMjd:Double
    let tcgMjd:Double
    let source:String
}
enum NativeWorldLabTimeScales {
    static let iauLG=6.969290134e-10
    static let iauLB=1.550519768e-8
    static let iauTDB0Seconds = -6.55e-5
    static let iauReferenceMJD=43144.0003725
    private static let unixEpochMJD=40587.0
    private static let secondsPerDay=86400.0
    private static func boundedMJD(_ value:Double,_ label:String)throws->Double {
        guard value.isFinite,abs(value)<=1_000_000_000 else {
            throw NativeWorldLabError.invalid("\(label) must be a finite MJD within ±1,000,000,000 days.")
        }
        return value
    }
    static func ttMjdToTcgMjd(_ ttMjd:Double)throws->Double {
        let value=try boundedMJD(ttMjd,"TT MJD")
        return iauReferenceMJD+(value-iauReferenceMJD)/(1-iauLG)
    }
    static func tcgMjdToTtMjd(_ tcgMjd:Double)throws->Double {
        let value=try boundedMJD(tcgMjd,"TCG MJD")
        return iauReferenceMJD+(value-iauReferenceMJD)*(1-iauLG)
    }
    static func tcbMjdToTdbMjd(_ tcbMjd:Double)throws->Double {
        let value=try boundedMJD(tcbMjd,"TCB MJD")
        return iauReferenceMJD+(value-iauReferenceMJD)*(1-iauLB)+iauTDB0Seconds/secondsPerDay
    }
    static func tdbMjdToTcbMjd(_ tdbMjd:Double)throws->Double {
        let value=try boundedMJD(tdbMjd,"TDB MJD")
        return iauReferenceMJD+(value-iauReferenceMJD-iauTDB0Seconds/secondsPerDay)/(1-iauLB)
    }
    static func utcToTcg(_ utc:String)throws->NativeWorldLabTcgReading {
        let date=try parseUTC(utc),offset=try taiOffset(date)
        let ttDate=date.addingTimeInterval(Double(offset)+32.184)
        let ttMjd=unixEpochMJD+ttDate.timeIntervalSince1970/secondsPerDay
        let tcgMjd=try ttMjdToTcgMjd(ttMjd)
        let tcgDate=Date(timeIntervalSince1970:(tcgMjd-unixEpochMJD)*secondsPerDay)
        return NativeWorldLabTcgReading(utc:utc,tt:iso(ttDate,"TT"),tcg:iso(tcgDate,"TCG"),
            ttMjd:ttMjd,tcgMjd:tcgMjd,source:"IAU 2000 Resolution B1.9")
    }
    static let leapSource="USNO/IERS tai-utc.dat"
    static let leapValidThroughUTC="2027-01-01T00:00:00Z"
    private static let leapRows:[(String,Int)]=[
        ("1972-01-01",10),("1972-07-01",11),("1973-01-01",12),
        ("1974-01-01",13),("1975-01-01",14),("1976-01-01",15),
        ("1977-01-01",16),("1978-01-01",17),("1979-01-01",18),
        ("1980-01-01",19),("1981-07-01",20),("1982-07-01",21),
        ("1983-07-01",22),("1985-07-01",23),("1988-01-01",24),
        ("1990-01-01",25),("1991-01-01",26),("1992-07-01",27),
        ("1993-07-01",28),("1994-07-01",29),("1996-01-01",30),
        ("1997-07-01",31),("1999-01-01",32),("2006-01-01",33),
        ("2009-01-01",34),("2012-07-01",35),("2015-07-01",36),
        ("2017-01-01",37)
    ]
    static func parseUTC(_ value:String)throws->Date {
        guard value.hasSuffix("Z"),
              let date=ISO8601DateFormatter().date(from:value) else {
            throw NativeWorldLabError.invalid("Time-scale input must be a valid UTC timestamp ending in Z.")
        }
        return date
    }
    static func parseDay(_ value:String)throws->Date {
        let pattern="^\\d{4}-\\d{2}-\\d{2}$"
        guard value.range(of:pattern,options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("UTC day must use YYYY-MM-DD.")
        }
        let formatter=DateFormatter()
        formatter.calendar=Calendar(identifier:.gregorian)
        formatter.timeZone=TimeZone(secondsFromGMT:0)
        formatter.locale=Locale(identifier:"en_US_POSIX")
        formatter.dateFormat="yyyy-MM-dd"
        guard let date=formatter.date(from:value),formatter.string(from:date)==value else {
            throw NativeWorldLabError.invalid("UTC day is not a valid Gregorian calendar date.")
        }
        return date
    }
    private static func iso(_ date:Date,_ label:String)->String {
        let formatter=ISO8601DateFormatter()
        formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return formatter.string(from:date)+" "+label
    }
    private static func taiOffset(_ date:Date)throws->Int {
        let start=try parseUTC("1972-01-01T00:00:00Z")
        let end=try parseUTC(leapValidThroughUTC)
        guard date>=start,date<=end else {
            throw NativeWorldLabError.invalid("TAI−UTC is not certified by the bundled IERS leap-second data for this date.")
        }
        for row in leapRows.reversed() {
            if date >= (try parseDay(row.0)) {return row.1}
        }
        throw NativeWorldLabError.invalid("No authoritative TAI−UTC offset is available for this date.")
    }
    static func utcToTaiTt(_ utc:String)throws->(tai:String,tt:String,taiMinusUtcSeconds:Int,ttMinusUtcSeconds:Double) {
        let date=try parseUTC(utc),offset=try taiOffset(date)
        let tai=date.addingTimeInterval(Double(offset))
        let tt=date.addingTimeInterval(Double(offset)+32.184)
        return (iso(tai,"TAI"),iso(tt,"TT"),offset,Double(offset)+32.184)
    }
    static func parseBulletinA(_ raw:String)throws->NativeWorldLabEarthOrientationSeries {
        guard raw.utf8.count>=100,raw.utf8.count<=2*1024*1024 else {
            throw NativeWorldLabError.invalid("IERS Bulletin A import must be between 100 bytes and 2 MB.")
        }
        guard raw.range(of:"I\\s*E\\s*R\\s*S\\s+B\\s*U\\s*L\\s*L\\s*E\\s*T\\s*I\\s*N\\s*[-–]\\s*A",
                        options:[.regularExpression,.caseInsensitive]) != nil else {
            throw NativeWorldLabError.invalid("Import must be the official plain-text IERS Bulletin A product (ser7.dat).")
        }
        let headerPattern="(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})\\s+Vol\\.\\s+([IVXLCDM]+)\\s+No\\.?\\s*(\\d+)"
        guard let regex=try? NSRegularExpression(pattern:headerPattern,options:.caseInsensitive),
              let match=regex.firstMatch(in:raw,range:NSRange(raw.startIndex...,in:raw)) else {
            throw NativeWorldLabError.invalid("IERS Bulletin A issue date and bulletin number could not be identified.")
        }
        func group(_ n:Int)->String {
            guard let range=Range(match.range(at:n),in:raw) else{return ""}
            return String(raw[range])
        }
        let months=["january","february","march","april","may","june","july","august","september","october","november","december"]
        guard let month=months.firstIndex(of:group(2).lowercased()),
              let day=Int(group(1)),let year=Int(group(3)),let number=Int(group(5)) else {
            throw NativeWorldLabError.invalid("IERS Bulletin A issue date is invalid.")
        }
        var issueComponents=DateComponents()
        issueComponents.calendar=Calendar(identifier:.gregorian)
        issueComponents.timeZone=TimeZone(secondsFromGMT:0)
        issueComponents.year=year;issueComponents.month=month+1;issueComponents.day=day
        guard let issueDate=issueComponents.calendar?.date(from:issueComponents),
              Calendar(identifier:.gregorian).dateComponents(in:TimeZone(secondsFromGMT:0)!,from:issueDate).day==day else {
            throw NativeWorldLabError.invalid("IERS Bulletin A issue date is invalid.")
        }
        let issueFormatter=DateFormatter()
        issueFormatter.calendar=Calendar(identifier:.gregorian);issueFormatter.timeZone=TimeZone(secondsFromGMT:0)
        issueFormatter.locale=Locale(identifier:"en_US_POSIX");issueFormatter.dateFormat="yyyy-MM-dd"
        var combined=false,predictions=false
        var algorithm="IERS Rapid Service/Prediction Centre source-defined algorithm"
        var samples:[NativeWorldLabEarthOrientationSample]=[]
        var lastObservedMjd:Int?
        for line in raw.components(separatedBy:.newlines) {
            if line.localizedCaseInsensitiveContains("COMBINED EARTH ORIENTATION PARAMETERS"){combined=true}
            if line.trimmingCharacters(in:.whitespaces).uppercased().hasPrefix("PREDICTIONS:"){predictions=true}
            if line.localizedCaseInsensitiveContains("Kalman smoother and weighted cubic spline"){
                algorithm="IERS Rapid Service Kalman smoother and weighted cubic spline"
            }
            guard combined else{continue}
            let t=line.split(whereSeparator:{$0.isWhitespace}).map(String.init)
            if !predictions,t.count>=10,t[0].range(of:"^\\d{2}$",options:.regularExpression) != nil,
               let yy=Int(t[0]),let mm=Int(t[1]),let dd=Int(t[2]),let mjd=Int(t[3]),
               let dut1=Double(t[8]),let uncertainty=Double(t[9]) {
                let y=yy<50 ? 2000+yy : 1900+yy
                var c=DateComponents();c.calendar=Calendar(identifier:.gregorian)
                c.timeZone=TimeZone(secondsFromGMT:0);c.year=y;c.month=mm;c.day=dd
                guard let date=c.calendar?.date(from:c) else{continue}
                let day=issueFormatter.string(from:date)
                samples.append(NativeWorldLabEarthOrientationSample(utcDay:day,mjd:mjd,
                    dut1Seconds:dut1,uncertaintySeconds:uncertainty,quality:.observed))
                lastObservedMjd=mjd
            }else if predictions,t.count>=7,t[0].range(of:"^\\d{4}$",options:.regularExpression) != nil,
                     let y=Int(t[0]),let mm=Int(t[1]),let dd=Int(t[2]),let mjd=Int(t[3]),let dut1=Double(t[6]) {
                var c=DateComponents();c.calendar=Calendar(identifier:.gregorian)
                c.timeZone=TimeZone(secondsFromGMT:0);c.year=y;c.month=mm;c.day=dd
                guard let date=c.calendar?.date(from:c) else{continue}
                let day=issueFormatter.string(from:date)
                guard let lastObservedMjd else {
                    throw NativeWorldLabError.invalid("IERS prediction rows require a preceding observed Earth-orientation sample.")
                }
                let daysAfterLastObservation=mjd-lastObservedMjd
                guard daysAfterLastObservation>0 else {
                    throw NativeWorldLabError.invalid("IERS prediction date must follow the last observed sample.")
                }
                let uncertainty=0.00025*pow(Double(daysAfterLastObservation),0.75)
                samples.append(NativeWorldLabEarthOrientationSample(utcDay:day,mjd:mjd,
                    dut1Seconds:dut1,uncertaintySeconds:uncertainty,quality:.predicted))
            }
        }
        guard samples.contains(where:{$0.quality == .observed}),
              samples.contains(where:{$0.quality == .predicted}) else {
            throw NativeWorldLabError.invalid("Bulletin A must include both rapid-service observations and prediction rows.")
        }
        return try NativeWorldLabEarthOrientationSeries(volume:group(4),number:number,
            issuedDateUTC:issueFormatter.string(from:issueDate),algorithm:algorithm,samples:samples)
    }
    static func utcToUt1(_ utc:String,series:NativeWorldLabEarthOrientationSeries)throws->NativeWorldLabTimeScaleReading {
        try series.validate()
        let date=try parseUTC(utc)
        guard let first=series.samples.first,let last=series.samples.last else {
            throw NativeWorldLabError.invalid("IERS Earth-orientation series is empty.")
        }
        let firstDate=try parseDay(first.utcDay),lastDate=try parseDay(last.utcDay)
        guard date>=firstDate,date<=lastDate else {
            throw NativeWorldLabError.invalid("UT1−UTC is unavailable outside the imported IERS Bulletin A coverage.")
        }
        var index=0
        while index<series.samples.count-1 {
            let next=try parseDay(series.samples[index+1].utcDay)
            if next>date{break}
            index+=1
        }
        let left=series.samples[index]
        let dut1:Double,sigma:Double,quality:NativeWorldLabEarthOrientationQuality
        if index==series.samples.count-1 {
            guard date==lastDate else {
                throw NativeWorldLabError.invalid("An adjacent IERS sample is required to interpolate UT1−UTC.")
            }
            dut1=left.dut1Seconds;sigma=left.uncertaintySeconds;quality=left.quality
        } else {
            let right=series.samples[index+1]
            let leftDate=try parseDay(left.utcDay)
            let fraction=date.timeIntervalSince(leftDate)/86400
            guard (0...1).contains(fraction) else {
                throw NativeWorldLabError.invalid("IERS interpolation interval is invalid.")
            }
            dut1=left.dut1Seconds+(right.dut1Seconds-left.dut1Seconds)*fraction
            let leftVariance=pow(1-fraction,2)*pow(left.uncertaintySeconds,2)
            let rightVariance=pow(fraction,2)*pow(right.uncertaintySeconds,2)
            sigma=sqrt(leftVariance+rightVariance)
            quality=(left.quality == .predicted || right.quality == .predicted) ? .predicted : .observed
        }
        let converted=try utcToTaiTt(utc)
        return NativeWorldLabTimeScaleReading(utc:utc,tai:converted.tai,tt:converted.tt,
            ut1:iso(date.addingTimeInterval(dut1),"UT1"),
            taiMinusUtcSeconds:converted.taiMinusUtcSeconds,ttMinusUtcSeconds:converted.ttMinusUtcSeconds,
            dut1Seconds:dut1,ut1UncertaintySeconds:sigma,quality:quality,
            source:"IERS Bulletin A",bulletin:"Volume "+series.volume+" No. "+String(series.number),
            issuedDateUTC:series.issuedDateUTC)
    }
}


// MARK: - Deterministic model-input replay manifest

struct NativeWorldLabReplayManifest:Equatable {
    let format:String
    let schemaVersion:Int
    let modelId:String
    let modelVersion:String
    let worldEpochUTC:String
    let timezoneDisplay:String
    let parameters:[String:Double]
    let sampleTimesSeconds:[Double]
    let mandatoryEventTimesSeconds:[Double]
    let eventQueuePolicy:String
    let randomStatePolicy:String
    let solverStatePolicy:String
    let inputFingerprint:String

    static let formatName="env-world-lab-replay-manifest"
    static let maxBytes=64*1024
    static let version="1.0.0"
    static let eventPolicy="empty-no-discrete-events"
    static let randomPolicy="deterministic-no-random-state"
    static let solverPolicy="rebuild-from-validated-inputs"

    static func parameterKeys(_ modelId:String)throws->[String] {
        switch modelId {
        case "spring":return ["massKg","springNPerM","dampingNsPerM","initialDisplacementM","initialVelocityMPerS"]
        case "rc":return ["resistanceOhm","capacitanceF","supplyVoltageV","initialVoltageV"]
        case "heat":return ["diffusivityM2PerS","lengthMeters","ambientTemperatureK","centerTemperatureK"]
        default:throw NativeWorldLabError.invalid("Unsupported deterministic reference model.")
        }
    }
    private static func values(_ input:NativeLabInput)->(String,[String:Double]) {
        switch input {
        case let .spring(mass,spring,damping,x0,v0):
            return ("spring",["massKg":mass,"springNPerM":spring,
                "dampingNsPerM":damping,"initialDisplacementM":x0,"initialVelocityMPerS":v0])
        case let .rc(resistance,capacitance,supply,initial):
            return ("rc",["resistanceOhm":resistance,"capacitanceF":capacitance,
                "supplyVoltageV":supply,"initialVoltageV":initial])
        case let .heat(diffusivity,length,ambient,center):
            return ("heat",["diffusivityM2PerS":diffusivity,"lengthMeters":length,
                "ambientTemperatureK":ambient,"centerTemperatureK":center])
        }
    }
    static func make(input:NativeLabInput,worldEpochUTC:String,timezoneDisplay:String,
        sampleTimesSeconds:[Double]=stride(from:0.0,through:12.0,by:0.1).map{$0})throws->Self {
        let (modelId,parameters)=values(input)
        let base=Self(format:formatName,schemaVersion:1,modelId:modelId,modelVersion:version,
            worldEpochUTC:worldEpochUTC,timezoneDisplay:timezoneDisplay,parameters:parameters,
            sampleTimesSeconds:sampleTimesSeconds,mandatoryEventTimesSeconds:[],
            eventQueuePolicy:eventPolicy,randomStatePolicy:randomPolicy,
            solverStatePolicy:solverPolicy,inputFingerprint:"0000000000000000")
        let value=Self(format:base.format,schemaVersion:base.schemaVersion,modelId:base.modelId,
            modelVersion:base.modelVersion,worldEpochUTC:base.worldEpochUTC,
            timezoneDisplay:base.timezoneDisplay,parameters:base.parameters,
            sampleTimesSeconds:base.sampleTimesSeconds,mandatoryEventTimesSeconds:[],
            eventQueuePolicy:base.eventQueuePolicy,randomStatePolicy:base.randomStatePolicy,
            solverStatePolicy:base.solverStatePolicy,inputFingerprint:fingerprint(base))
        try value.validate()
        return value
    }
    private static func bits(_ value:Double)->String {
        let raw=String(value.bitPattern,radix:16,uppercase:false)
        return String(repeating:"0",count:max(0,16-raw.count))+raw
    }
    private func canonical()->String {
        var text="env-world-lab-replay-v1\n"
        text+=modelId+"\n"+modelVersion+"\n"+worldEpochUTC+"\n"+timezoneDisplay+"\n"
        for key in (try? Self.parameterKeys(modelId)) ?? [] {
            text+=key+"="+Self.bits(parameters[key] ?? .nan)+"\n"
        }
        for time in sampleTimesSeconds {text+="sample="+Self.bits(time)+"\n"}
        text+=eventQueuePolicy+"\n"+randomStatePolicy+"\n"+solverStatePolicy+"\n"
        return text
    }
    private static func fingerprint(_ value:Self)->String {
        var hash:UInt64=14695981039346656037
        for byte in value.canonical().utf8 {
            hash=(hash ^ UInt64(byte)) &* 1099511628211
        }
        let raw=String(hash,radix:16,uppercase:false)
        return String(repeating:"0",count:max(0,16-raw.count))+raw
    }
    func validate()throws {
        guard format==Self.formatName,schemaVersion==1,modelVersion==Self.version else {
            throw NativeWorldLabError.invalid("Replay manifest format or solver version is unsupported.")
        }
        guard worldEpochUTC.hasSuffix("Z"),ISO8601DateFormatter().date(from:worldEpochUTC) != nil else {
            throw NativeWorldLabError.invalid("Replay world epoch must be a valid UTC-Z timestamp.")
        }
        guard TimeZone(identifier:timezoneDisplay) != nil else {
            throw NativeWorldLabError.invalid("Replay display timezone is unsupported.")
        }
        let keys=try Self.parameterKeys(modelId)
        guard Set(parameters.keys)==Set(keys),parameters.values.allSatisfy({$0.isFinite}) else {
            throw NativeWorldLabError.invalid("Replay model parameters are missing, unknown or non-finite.")
        }
        guard sampleTimesSeconds.count>=2,sampleTimesSeconds.count<=121,
              sampleTimesSeconds.first==0,sampleTimesSeconds.last!<=12,
              sampleTimesSeconds.allSatisfy({$0.isFinite && $0>=0}),
              sampleTimesSeconds.enumerated().allSatisfy({$0.offset==0 || $0.element>sampleTimesSeconds[$0.offset-1]}) else {
            throw NativeWorldLabError.invalid("Replay sample axis must increase from zero through at most 12 seconds.")
        }
        guard mandatoryEventTimesSeconds.isEmpty,eventQueuePolicy==Self.eventPolicy,
              randomStatePolicy==Self.randomPolicy,solverStatePolicy==Self.solverPolicy else {
            throw NativeWorldLabError.invalid("Replay manifest declares unsupported event, random or solver state.")
        }
        guard inputFingerprint.count==16,inputFingerprint==Self.fingerprint(self) else {
            throw NativeWorldLabError.invalid("Replay manifest input fingerprint does not match its contents.")
        }
    }
    func input()throws->NativeLabInput {
        try validate()
        let p=parameters
        switch modelId {
        case "spring":return .spring(massKg:p["massKg"]!,springNPerM:p["springNPerM"]!,
            dampingNsPerM:p["dampingNsPerM"]!,x0:p["initialDisplacementM"]!,v0:p["initialVelocityMPerS"]!)
        case "rc":return .rc(resistanceOhm:p["resistanceOhm"]!,capacitanceF:p["capacitanceF"]!,
            supplyV:p["supplyVoltageV"]!,initialV:p["initialVoltageV"]!)
        default:return .heat(diffusivityM2S:p["diffusivityM2PerS"]!,lengthM:p["lengthMeters"]!,
            backgroundK:p["ambientTemperatureK"]!,centerK:p["centerTemperatureK"]!)
        }
    }
    func encodeBounded()throws->Data {
        try validate()
        let params=Dictionary(uniqueKeysWithValues:parameters)
        let root:[String:Any]=[
            "format":format,"schemaVersion":schemaVersion,"modelId":modelId,
            "modelVersion":modelVersion,"worldEpochUTC":worldEpochUTC,
            "timezoneDisplay":timezoneDisplay,"parameters":params,
            "sampleTimesSeconds":sampleTimesSeconds,
            "mandatoryEventTimesSeconds":mandatoryEventTimesSeconds,
            "eventQueuePolicy":eventQueuePolicy,"randomStatePolicy":randomStatePolicy,
            "solverStatePolicy":solverStatePolicy,"inputFingerprint":inputFingerprint
        ]
        let data=try JSONSerialization.data(withJSONObject:root,options:[.prettyPrinted,.sortedKeys,.fragmentsAllowed])
        guard data.count<=Self.maxBytes else {
            throw NativeWorldLabError.invalid("Deterministic replay manifest exceeds 64 KB.")
        }
        return data
    }
    static func decodeAndReplay(_ data:Data)throws->(manifest:Self,input:NativeLabInput,samples:[NativeLabResult]) {
        guard !data.isEmpty,data.count<=maxBytes else {
            throw NativeWorldLabError.invalid("Replay manifest must be between 1 byte and 64 KB.")
        }
        guard let root=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {
            throw NativeWorldLabError.invalid("Replay manifest JSON must be an object.")
        }
        let expected:Set<String>=["format","schemaVersion","modelId","modelVersion","worldEpochUTC",
            "timezoneDisplay","parameters","sampleTimesSeconds","mandatoryEventTimesSeconds",
            "eventQueuePolicy","randomStatePolicy","solverStatePolicy","inputFingerprint"]
        guard Set(root.keys)==expected,
              let schema=(root["schemaVersion"] as? NSNumber)?.intValue,
              let modelId=root["modelId"] as? String,
              let version=root["modelVersion"] as? String,
              let epoch=root["worldEpochUTC"] as? String,
              let timezone=root["timezoneDisplay"] as? String,
              let rawParameters=root["parameters"] as? [String:Any],
              let rawSamples=root["sampleTimesSeconds"] as? [Any],
              let rawEvents=root["mandatoryEventTimesSeconds"] as? [Any],
              let eventPolicy=root["eventQueuePolicy"] as? String,
              let randomPolicy=root["randomStatePolicy"] as? String,
              let solverPolicy=root["solverStatePolicy"] as? String,
              let digest=root["inputFingerprint"] as? String else {
            throw NativeWorldLabError.invalid("Replay manifest has unknown, missing or mistyped fields.")
        }
        let keys=try parameterKeys(modelId)
        guard Set(rawParameters.keys)==Set(keys) else {
            throw NativeWorldLabError.invalid("Replay parameter set has unknown or missing fields.")
        }
        func number(_ value:Any?,_ label:String)throws->Double {
            guard let value=value as? NSNumber,CFGetTypeID(value) != CFBooleanGetTypeID(),
                  value.doubleValue.isFinite else {
                throw NativeWorldLabError.invalid("Replay \(label) must be a finite number.")
            }
            return value.doubleValue
        }
        let params=try Dictionary(uniqueKeysWithValues:keys.map{key in
            (key,try number(rawParameters[key],"parameter "+key))
        })
        let samples=try rawSamples.map{try number($0,"sample time")}
        let events=try rawEvents.map{try number($0,"event time")}
        let manifest=Self(format:root["format"] as? String ?? "",schemaVersion:schema,
            modelId:modelId,modelVersion:version,worldEpochUTC:epoch,timezoneDisplay:timezone,
            parameters:params,sampleTimesSeconds:samples,mandatoryEventTimesSeconds:events,
            eventQueuePolicy:eventPolicy,randomStatePolicy:randomPolicy,
            solverStatePolicy:solverPolicy,inputFingerprint:digest)
        try manifest.validate()
        let input=try manifest.input()
        let results=try samples.map{try NativeWorldLabScience.evaluate(input,atSeconds:$0)}
        return (manifest,input,results)
    }
}

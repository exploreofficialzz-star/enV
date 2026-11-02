import XCTest
@testable import enV
final class NativeWorldLabTimeCheckpointTests:XCTestCase {
 func testCheckpointRoundTripPreservesModeAndInputs()throws {
  let c=try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:4.5,
   massKg:2,springNPerM:8,resistanceOhm:2200,diffusivityM2PerS:0.03)
  let restored=try NativeWorldLabDemoCheckpoint.decodeBounded(c.encodeBounded())
  XCTAssertEqual(restored,c)
  XCTAssertNil(restored.solverStepSeconds)
 }
 func testVersionTwoClockRoundTripPreservesUTCAndPlaybackState()throws {
  let c=try NativeWorldLabDemoCheckpoint.make(modelId:"heat",timeSeconds:2.5,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,
   wallTimeUTC:"2026-11-01T12:00:05Z",worldEpochUTC:"2020-01-01T00:00:00Z",
   solverInternalTimeSeconds:2.5,displaySampleTimeSeconds:2.5,
   playbackRate:10,playbackDirection:"reverse-recording",timezoneDisplay:"Africa/Lagos",solverStepSeconds:0.0025)
  XCTAssertEqual(c.schemaVersion,3)
  let restored=try NativeWorldLabDemoCheckpoint.decodeBounded(c.encodeBounded())
  XCTAssertEqual(restored,c)
  XCTAssertEqual(restored.solverStepSeconds,0.0025)
 }
 func testVersionOneCheckpointStillDecodes()throws {
  let legacy=#"{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":1,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":4.5,"massKg":2.0,"springNPerM":8.0,"resistanceOhm":2200.0,"diffusivityM2PerS":0.03}"#
  let decoded=try NativeWorldLabDemoCheckpoint.decodeBounded(Data(legacy.utf8))
  XCTAssertEqual(decoded.timeSeconds,4.5);XCTAssertNil(decoded.wallTimeUTC)
 }
 func testClockCheckpointRejectsInvalidOrPartialData()throws {
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:2,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,wallTimeUTC:"bad"))
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:2,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,
   wallTimeUTC:"2026-11-01T12:00:00Z",worldEpochUTC:"2020-01-01T00:00:00Z",
   solverInternalTimeSeconds:2,displaySampleTimeSeconds:2,playbackRate:0,
   playbackDirection:"forward",timezoneDisplay:"UTC"))
 }
 func testCheckpointRejectsUnsupportedModelsAndOutOfRangeTime()throws {
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"unknown",timeSeconds:0,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02))
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"heat",timeSeconds:13,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02))
 }
 func testPlaybackStopsAtEveryScheduledEvent() {
  XCTAssertEqual(NativeWorldLabTime.next(current:0,elapsed:0.5,rate:10,duration:5,events:[1,2]),1,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.next(current:1,elapsed:0.5,rate:10,duration:5,events:[1,2]),2,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.next(current:2,elapsed:0.1,rate:1,duration:5,events:[1,2]),2.1,accuracy:1e-12)
 }
 func testReversePlaybackStopsAtThePreviousRecordedEvent() {
  XCTAssertEqual(NativeWorldLabTime.previous(current:3,elapsed:0.5,rate:4,
      duration:5,events:[1,2]),2,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.advance(current:2,elapsed:0.5,rate:4,
      duration:5,events:[1,2],reverse:true),1,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.previous(current:1,elapsed:0.5,rate:1,
      duration:5,events:[1,2]),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.advance(current:1,elapsed:0.5,rate:1,
      duration:5,events:[Double.nan,6],reverse:true),0.5,accuracy:1e-12)
 }
 func testPreviousAndNextContactNavigationIsBoundedAndSorted() {
  let events=[0.8,0.2,0.5,0.5,Double.nan,-1,4]
  XCTAssertEqual(NativeWorldLabTime.previousEvent(current:0,duration:3,events:events),0,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.previousEvent(current:0.7,duration:3,events:events),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.nextEvent(current:0.2,duration:3,events:events),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.nextEvent(current:0.8,duration:3,events:events),3,accuracy:1e-12)
 }
 func testVersionTwoClockCheckpointRemainsReadableWithoutSolverStep()throws {
  let json=#"{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":2,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":2.0,"massKg":1.0,"springNPerM":4.0,"resistanceOhm":1000.0,"diffusivityM2PerS":0.02,"wallTimeUTC":"2026-11-01T12:00:00Z","worldEpochUTC":"2020-01-01T00:00:00Z","solverInternalTimeSeconds":2.0,"displaySampleTimeSeconds":2.0,"playbackRate":1.0,"playbackDirection":"forward","timezoneDisplay":"UTC"}"#
  let v=try NativeWorldLabDemoCheckpoint.decodeBounded(Data(json.utf8))
  XCTAssertEqual(v.schemaVersion,2);XCTAssertNil(v.solverStepSeconds)
 }
}


final class NativeWorldLabRecordedTimeTests:XCTestCase {
    private func makeRecordedRun()->NativeWorldLabRecordedRun {
        NativeWorldLabRecordedRun(runId:"run-1",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleTimesSeconds:[0,0.1,0.2,0.3,0.4,0.5],
            mandatoryEventTimesSeconds:[0.2,0.4])
    }
    private func state()throws->NativeWorldLabRecordedClock {
        try NativeWorldLabRecordedTime.start(run:makeRecordedRun(),
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
    }
    func testPauseAdvancesWallClockWithoutAdvancingSimulationOrWorldDate()throws {
        let initial=try state()
        let paused=try NativeWorldLabRecordedTime.advance(run:makeRecordedRun(),state:initial,
            elapsedSeconds:2,paused:true)
        XCTAssertEqual(paused.simulationTimeSeconds,initial.simulationTimeSeconds,accuracy:0)
        XCTAssertEqual(paused.worldDateUTC,initial.worldDateUTC)
        XCTAssertEqual(ISO8601DateFormatter().date(from:paused.wallTimeUTC)?.timeIntervalSince1970 ?? 0,
            ISO8601DateFormatter().date(from:initial.wallTimeUTC)!.timeIntervalSince1970+2,accuracy:0.001)
    }
    func testPlaybackRespectsRateMandatoryEventsAndCachedReverse()throws {
        let initial=try state()
        let forward=try NativeWorldLabRecordedTime.advance(run:makeRecordedRun(),
            state:NativeWorldLabRecordedClock(wallTimeUTC:initial.wallTimeUTC,
                worldDateUTC:initial.worldDateUTC,simulationTimeSeconds:0,
                solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0,sampleIndex:0,
                playbackRate:10,direction:"forward",paused:false,timezoneDisplay:"Africa/Lagos",
                fidelity:"recorded-sample-playback"),elapsedSeconds:0.05)
        XCTAssertEqual(forward.simulationTimeSeconds,0.2,accuracy:1e-9)
        let reverseState=NativeWorldLabRecordedClock(wallTimeUTC:forward.wallTimeUTC,
            worldDateUTC:forward.worldDateUTC,simulationTimeSeconds:0.2,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0.2,sampleIndex:2,
            playbackRate:10,direction:"reverse-recording",paused:false,
            timezoneDisplay:"Africa/Lagos",fidelity:"recorded-sample-playback")
        let reverse=try NativeWorldLabRecordedTime.advance(run:makeRecordedRun(),state:reverseState,elapsedSeconds:0.05)
        XCTAssertEqual(reverse.simulationTimeSeconds,0,accuracy:1e-9)
    }
    func testSeekAndStepSelectExactRecordedSamplesAndPause()throws {
        let initial=try state()
        let step=try NativeWorldLabRecordedTime.step(run:makeRecordedRun(),state:initial,direction:1)
        XCTAssertEqual(step.sampleIndex,1);XCTAssertEqual(step.simulationTimeSeconds,0.1,accuracy:0)
        let seek=try NativeWorldLabRecordedTime.seek(run:makeRecordedRun(),state:step,timeSeconds:0.39)
        XCTAssertEqual(seek.sampleIndex,4);XCTAssertEqual(seek.displaySampleTimeSeconds,0.4,accuracy:0)
        XCTAssertTrue(seek.paused)
    }
    func testCheckpointIsBoundToRunVersionEpochAndExactSample()throws {
        let selected=try NativeWorldLabRecordedTime.seek(run:makeRecordedRun(),state:state(),timeSeconds:0.3)
        let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:makeRecordedRun(),state:selected)
        let bytes=try checkpoint.encodeBounded()
        let decoded=try NativeWorldLabRecordedCheckpoint.decodeBounded(bytes)
        let restored=try NativeWorldLabRecordedTime.restore(run:makeRecordedRun(),checkpoint:decoded)
        XCTAssertEqual(restored.sampleIndex,3);XCTAssertTrue(restored.paused)
        let other=NativeWorldLabRecordedRun(runId:"other",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:makeRecordedRun().sampleTimesSeconds,
            mandatoryEventTimesSeconds:makeRecordedRun().mandatoryEventTimesSeconds)
        XCTAssertThrowsError(try NativeWorldLabRecordedTime.restore(run:other,checkpoint:decoded))
        let forged=NativeWorldLabRecordedCheckpoint(runId:"run-1",modelId:"spring",
            modelVersion:"2.1.0",worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleIndex:1,sampleTimeSeconds:0.1,clock:selected)
        XCTAssertThrowsError(try NativeWorldLabRecordedTime.restore(run:makeRecordedRun(),checkpoint:forged))
    }
    func testInvalidTimelineAxesAndEventTimesAreRejected() {
        let duplicate=NativeWorldLabRecordedRun(runId:"bad",modelId:"spring",modelVersion:"1",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:[0,0.1,0.1])
        XCTAssertThrowsError(try duplicate.validate())
        let event=NativeWorldLabRecordedRun(runId:"bad",modelId:"spring",modelVersion:"1",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:[0,0.1,0.2],
            mandatoryEventTimesSeconds:[0.25])
        XCTAssertThrowsError(try event.validate())
    }
}

final class NativeWorldLabRecordedEventBoundaryTests:XCTestCase {
    private func makeRecordedRun()->NativeWorldLabRecordedRun {
        NativeWorldLabRecordedRun(runId:"run-1",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleTimesSeconds:[0,0.1,0.2,0.3,0.4,0.5])
    }
    func testMandatoryEventBetweenSamplesStopsAtExactSimulationTime()throws {
        let base=makeRecordedRun()
        let recording=NativeWorldLabRecordedRun(runId:base.runId,modelId:base.modelId,
            modelVersion:base.modelVersion,worldEpochUTC:base.worldEpochUTC,
            sampleTimesSeconds:base.sampleTimesSeconds,mandatoryEventTimesSeconds:[0.15])
        let initial=try NativeWorldLabRecordedTime.start(run:recording,
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
        let running=NativeWorldLabRecordedClock(wallTimeUTC:initial.wallTimeUTC,
            worldDateUTC:initial.worldDateUTC,simulationTimeSeconds:0,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0,sampleIndex:0,
            playbackRate:10,direction:"forward",paused:false,
            timezoneDisplay:"Africa/Lagos",fidelity:"recorded-sample-playback")
        let stopped=try NativeWorldLabRecordedTime.advance(run:recording,state:running,
            elapsedSeconds:0.05,paused:false)
        XCTAssertEqual(stopped.simulationTimeSeconds,0.15,accuracy:1e-9)
        let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:recording,state:stopped)
        XCTAssertEqual(try NativeWorldLabRecordedTime.restore(run:recording,checkpoint:checkpoint)
            .simulationTimeSeconds,0.15,accuracy:1e-9)
    }
}


final class NativeWorldLabRecordedCheckpointInteropTests:XCTestCase {
    private func makeRecordedRun()->NativeWorldLabRecordedRun {
        NativeWorldLabRecordedRun(runId:"interop-run",modelId:"native-actuator",
            modelVersion:"1.2.0",worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleTimesSeconds:[0,0.1,0.2])
    }
    func testCheckpointEncodesExplicitNullSolverTimeForAndroidCompatibility()throws {
        let recording=makeRecordedRun()
        let clock=try NativeWorldLabRecordedTime.start(run:recording,
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
        let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:recording,state:clock)
        let data=try checkpoint.encodeBounded()
        let root=try XCTUnwrap(JSONSerialization.jsonObject(with:data) as? [String:Any])
        let encodedClock=try XCTUnwrap(root["clock"] as? [String:Any])
        XCTAssertTrue(encodedClock.keys.contains("solverInternalTimeSeconds"))
        XCTAssertTrue(encodedClock["solverInternalTimeSeconds"] is NSNull)
        XCTAssertEqual(Set(encodedClock.keys),Set([
            "wallTimeUTC","worldDateUTC","simulationTimeSeconds","solverInternalTimeSeconds",
            "displaySampleTimeSeconds","sampleIndex","playbackRate","direction","paused",
            "timezoneDisplay","fidelity"
        ]))
    }
    func testDecoderRejectsUnknownRootAndClockFields()throws {
        let recording=makeRecordedRun()
        let clock=try NativeWorldLabRecordedTime.start(run:recording,
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
        let data=try NativeWorldLabRecordedTime.checkpoint(run:recording,state:clock).encodeBounded()
        var root=try XCTUnwrap(JSONSerialization.jsonObject(with:data) as? [String:Any])
        root["unsupported"]=true
        let altered=try JSONSerialization.data(withJSONObject:root)
        XCTAssertThrowsError(try NativeWorldLabRecordedCheckpoint.decodeBounded(altered))
        root.removeValue(forKey:"unsupported")
        var encodedClock=try XCTUnwrap(root["clock"] as? [String:Any])
        encodedClock["unsupported"]=1;root["clock"]=encodedClock
        let alteredClock=try JSONSerialization.data(withJSONObject:root)
        XCTAssertThrowsError(try NativeWorldLabRecordedCheckpoint.decodeBounded(alteredClock))
    }
}


final class NativeWorldLabDemoRecordingTests:XCTestCase {
    func testSpringRCAndHeatUseOneBoundedRecordedClockAxis()throws {
        let models:[(String,NativeLabInput)]=[
            ("native-spring",.spring()),
            ("native-rc",.rc()),
            ("native-heat",.heat())
        ]
        for (id,input) in models {
            let samples=try (0...120).map{try NativeWorldLabScience.evaluate(input,atSeconds:Double($0)/10)}
            XCTAssertEqual(samples.count,121)
            XCTAssertEqual(samples.last?.timeSeconds ?? -1,12,accuracy:1e-12)
            XCTAssertTrue(samples.allSatisfy{$0.timeSeconds.isFinite})
            let run=NativeWorldLabRecordedRun(runId:"recorded-\(id)",modelId:id,
                modelVersion:"1.0.0",worldEpochUTC:"2026-11-01T00:00:00Z",
                sampleTimesSeconds:samples.map{$0.timeSeconds})
            let started=try NativeWorldLabRecordedTime.start(run:run,
                wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
            let selected=try NativeWorldLabRecordedTime.seek(run:run,state:started,timeSeconds:0.76)
            XCTAssertEqual(selected.simulationTimeSeconds,0.8,accuracy:1e-12)
            let clock=NativeWorldLabRecordedClock(wallTimeUTC:selected.wallTimeUTC,
                worldDateUTC:selected.worldDateUTC,simulationTimeSeconds:selected.simulationTimeSeconds,
                solverInternalTimeSeconds:samples[selected.sampleIndex].timeSeconds,
                displaySampleTimeSeconds:selected.displaySampleTimeSeconds,sampleIndex:selected.sampleIndex,
                playbackRate:selected.playbackRate,direction:selected.direction,paused:true,
                timezoneDisplay:selected.timezoneDisplay,fidelity:selected.fidelity)
            let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:run,state:clock)
            let restored=try NativeWorldLabRecordedTime.restore(run:run,checkpoint:checkpoint)
            XCTAssertEqual(restored.sampleIndex,selected.sampleIndex)
            XCTAssertEqual(restored.displaySampleTimeSeconds,selected.displaySampleTimeSeconds,accuracy:1e-12)
        }
    }
}


final class NativeWorldLabBranchCurrentTests:XCTestCase {
    func testSignedCurrentSetsConventionalDirectionAndReversesWithPolarity()throws {
        let forward=try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"supply",negativeNodeId:"ground",signedCurrentA:0.25)
        XCTAssertEqual(forward.fromNodeId,"supply")
        XCTAssertEqual(forward.toNodeId,"ground")
        XCTAssertEqual(forward.direction,.positiveToNegative)
        XCTAssertEqual(forward.magnitudeA,0.25,accuracy:1e-12)
        let reverse=try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"supply",negativeNodeId:"ground",signedCurrentA:-0.25)
        XCTAssertEqual(reverse.fromNodeId,"ground")
        XCTAssertEqual(reverse.toNodeId,"supply")
        XCTAssertEqual(reverse.direction,.negativeToPositive)
    }
    func testZeroCurrentDoesNotInventDirectionAndInvalidEvidenceIsRejected()throws {
        let zero=try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"a",negativeNodeId:"b",signedCurrentA:0)
        XCTAssertEqual(zero.direction,.zero)
        XCTAssertNil(zero.fromNodeId);XCTAssertNil(zero.toNodeId)
        XCTAssertThrowsError(try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"a",negativeNodeId:"b",signedCurrentA:.nan))
        XCTAssertThrowsError(try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"a",negativeNodeId:"b",signedCurrentA:1e7))
        XCTAssertThrowsError(try NativeWorldLabBranchCurrent.resolve(
            positiveNodeId:"a",negativeNodeId:"a",signedCurrentA:1))
    }
}


    func testLagosSolarEventsAreOrderedUTCAndHaveClearAccuracyLabel() throws {
        let events=try NativeWorldLabSolarEvents.calculate(
            dateUTC:"2026-11-01",latitudeDegrees:6.5244,longitudeDegrees:3.3792)
        XCTAssertEqual(events.status,.normal)
        let sunrise=try XCTUnwrap(events.sunriseUTC)
        let sunset=try XCTUnwrap(events.sunsetUTC)
        XCTAssertLessThan(sunrise,events.solarNoonUTC)
        XCTAssertLessThan(events.solarNoonUTC,sunset)
        XCTAssertGreaterThan(events.daylightMinutes ?? 0,700)
        XCTAssertLessThan(events.daylightMinutes ?? 1000,730)
        XCTAssertEqual(events.method,"NOAA-general-solar-position-equations")
        XCTAssertTrue(events.validity.contains("Approximate"))
    }

    func testEquatorialEquinoxHasApproximatelyTwelveHoursDaylight() throws {
        let events=try NativeWorldLabSolarEvents.calculate(
            dateUTC:"2026-03-20",latitudeDegrees:0,longitudeDegrees:0)
        XCTAssertEqual(events.status,.normal)
        XCTAssertLessThan(abs((events.daylightMinutes ?? 0)-720),10)
    }

    func testPolarDayNightAndExactPolesDoNotInventSunriseOrSunset() throws {
        let cases:[(String,Double,NativeWorldLabSolarStatus)]=[
            ("2026-06-21",80,.polarDay),("2026-12-21",80,.polarNight),
            ("2026-06-21",90,.polarDay),("2026-12-21",90,.polarNight),
            ("2026-12-21",-90,.polarDay),("2026-06-21",-90,.polarNight)
        ]
        for (date,latitude,status) in cases {
            let events=try NativeWorldLabSolarEvents.calculate(
                dateUTC:date,latitudeDegrees:latitude,longitudeDegrees:0)
            XCTAssertEqual(events.status,status)
            XCTAssertNil(events.sunriseUTC)
            XCTAssertNil(events.sunsetUTC)
            XCTAssertNil(events.daylightMinutes)
        }
    }

    func testSolarDateAndCoordinateBoundsAreValidated() {
        XCTAssertThrowsError(try NativeWorldLabSolarEvents.calculate(
            dateUTC:"2025-02-29",latitudeDegrees:0,longitudeDegrees:0))
        XCTAssertThrowsError(try NativeWorldLabSolarEvents.calculate(
            dateUTC:"1799-12-31",latitudeDegrees:0,longitudeDegrees:0))
        XCTAssertThrowsError(try NativeWorldLabSolarEvents.calculate(
            dateUTC:"2026-01-01",latitudeDegrees:91,longitudeDegrees:0))
        XCTAssertThrowsError(try NativeWorldLabSolarEvents.calculate(
            dateUTC:"2026-01-01",latitudeDegrees:0,longitudeDegrees:181))
    }


extension NativeWorldLabTimeCheckpointTests {
    private var testBulletinA:String {
        """
        I E R S   B U L L E T I N - A
        29 October 2026                                     Vol. XXXIX No. 044
        COMBINED EARTH ORIENTATION PARAMETERS:
        26 10 28  61341 0.14424 .00004 0.31844 .00004 -0.051795 0.000011
        26 10 29  61342 0.14284 .00004 0.31828 .00004 -0.052612 0.000014
        PREDICTIONS:
        2026 10 30 61343 0.1414 0.3181 -0.05324
        2026 10 31 61344 0.1401 0.3179 -0.05383
        2026 11  1 61345 0.1388 0.3179 -0.05453
        2026 11  2 61346 0.1375 0.3180 -0.05542
        """
    }
    func testNativeIersBulletinImportPreservesObservedPredictedAndProvenance() throws {
        let series=try NativeWorldLabTimeScales.parseBulletinA(testBulletinA)
        XCTAssertEqual(series.volume,"XXXIX")
        XCTAssertEqual(series.number,44)
        XCTAssertEqual(series.issuedDateUTC,"2026-10-29")
        XCTAssertEqual(series.samples.count,6)
        XCTAssertEqual(series.samples[0].quality,.observed)
        XCTAssertEqual(series.samples[2].quality,.predicted)
    }
    func testNativeTaiTtAndUt1ConversionsRetainOffsetsAndUncertainty() throws {
        let series=try NativeWorldLabTimeScales.parseBulletinA(testBulletinA)
        let taiTt=try NativeWorldLabTimeScales.utcToTaiTt("2026-11-01T12:00:00Z")
        XCTAssertEqual(taiTt.taiMinusUtcSeconds,37)
        XCTAssertEqual(taiTt.ttMinusUtcSeconds,69.184,accuracy:1e-9)
        let reading=try NativeWorldLabTimeScales.utcToUt1("2026-11-01T12:00:00Z",series:series)
        XCTAssertEqual(reading.dut1Seconds ?? 0,-0.054975,accuracy:1e-9)
        XCTAssertEqual(reading.quality,.predicted)
        XCTAssertGreaterThan(reading.ut1UncertaintySeconds ?? 0,0)
        XCTAssertTrue(reading.bulletin?.contains("No. 44") == true)
    }
    func testPredictionUncertaintyStartsAtFinalObservedMjd() throws {
        let shifted=testBulletinA
            .replacingOccurrences(of:"29 October 2026",with:"29 October 2027")
            .replacingOccurrences(of:"26 10 28  61341",with:"27 10 28  61706")
            .replacingOccurrences(of:"26 10 29  61342",with:"27 10 29  61707")
            .replacingOccurrences(of:"2026 10 30 61343",with:"2027 10 30 61708")
            .replacingOccurrences(of:"2026 10 31 61344",with:"2027 10 31 61709")
            .replacingOccurrences(of:"2026 11  1 61345",with:"2027 11  1 61710")
            .replacingOccurrences(of:"2026 11  2 61346",with:"2027 11  2 61711")
        let series=try NativeWorldLabTimeScales.parseBulletinA(shifted)
        XCTAssertEqual(series.samples[2].uncertaintySeconds,0.00025,accuracy:1e-15)
        XCTAssertEqual(series.samples[3].uncertaintySeconds,0.00025*pow(2.0,0.75),accuracy:1e-15)
    }
    func testNativeTimeScaleConversionsFailClosedOutsideCertifiedCoverage() throws {
        let series=try NativeWorldLabTimeScales.parseBulletinA(testBulletinA)
        XCTAssertThrowsError(try NativeWorldLabTimeScales.utcToTaiTt("2027-01-02T00:00:00Z"))
        XCTAssertThrowsError(try NativeWorldLabTimeScales.utcToUt1("2026-11-10T00:00:00Z",series:series))
        XCTAssertThrowsError(try NativeWorldLabTimeScales.parseBulletinA("not IERS data"))
    }
}


extension NativeWorldLabTimeCheckpointTests {
    func testIauCoordinateTimeTransformsRoundTripAcrossGeologicalRanges() throws {
        let reference=NativeWorldLabTimeScales.iauReferenceMJD
        XCTAssertEqual(try NativeWorldLabTimeScales.ttMjdToTcgMjd(reference),reference,accuracy:0)
        XCTAssertEqual(try NativeWorldLabTimeScales.tcgMjdToTtMjd(reference),reference,accuracy:0)
        XCTAssertEqual(try NativeWorldLabTimeScales.ttMjdToTcgMjd(reference+1),
            reference+1/(1-NativeWorldLabTimeScales.iauLG),accuracy:1e-11)
        XCTAssertEqual(try NativeWorldLabTimeScales.tcbMjdToTdbMjd(reference),
            reference-NativeWorldLabTimeScales.iauTDB0Seconds/86400,accuracy:1e-11)
        for value in [-1_000_000.0,reference,1_000_000.0,100_000_000.0] {
            XCTAssertEqual(try NativeWorldLabTimeScales.tcgMjdToTtMjd(
                NativeWorldLabTimeScales.ttMjdToTcgMjd(value)),value,accuracy:2e-8)
            XCTAssertEqual(try NativeWorldLabTimeScales.tdbMjdToTcbMjd(
                NativeWorldLabTimeScales.tcbMjdToTdbMjd(value)),value,accuracy:2e-8)
        }
        XCTAssertThrowsError(try NativeWorldLabTimeScales.ttMjdToTcgMjd(.nan))
    }
    func testUtcToTcgUsesCertifiedTtAndIauRate() throws {
        let result=try NativeWorldLabTimeScales.utcToTcg("2026-11-01T12:00:00Z")
        XCTAssertEqual(result.source,"IAU 2000 Resolution B1.9")
        XCTAssertGreaterThan(result.tcgMjd,result.ttMjd)
        XCTAssertLessThan((result.tcgMjd-result.ttMjd)*86400,0.01)
    }
}


final class NativeWorldLabReplayManifestTests:XCTestCase {
    private let samples=[0.0,0.1,0.2,0.3,0.4]
    private func replay(_ input:NativeLabInput)throws->(NativeWorldLabReplayManifest,[NativeLabResult]) {
        let manifest=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"Africa/Lagos",
            sampleTimesSeconds:samples)
        let decoded=try NativeWorldLabReplayManifest.decodeAndReplay(manifest.encodeBounded())
        return (decoded.manifest,decoded.samples)
    }

    func testSpringManifestRebuildsIdenticalNativeSolverSamples() throws {
        let input=NativeLabInput.spring(massKg:2,springNPerM:8,dampingNsPerM:0.5,x0:0.25,v0:-0.1)
        let manifest=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"Africa/Lagos",sampleTimesSeconds:samples)
        let encoded=try manifest.encodeBounded()
        let decoded=try NativeWorldLabReplayManifest.decodeAndReplay(encoded)
        XCTAssertEqual(decoded.manifest,manifest)
        for (index,time) in samples.enumerated() {
            let expected=try NativeWorldLabScience.evaluate(input,atSeconds:time)
            let actual=decoded.samples[index]
            XCTAssertEqual(actual.timeSeconds,expected.timeSeconds,accuracy:0)
            XCTAssertEqual(actual.xMeters!,expected.xMeters!,accuracy:0)
            XCTAssertEqual(actual.velocityMPerS!,expected.velocityMPerS!,accuracy:0)
            XCTAssertEqual(actual.mechanicalEnergyJ!,expected.mechanicalEnergyJ!,accuracy:0)
        }
    }

    func testRcAndHeatManifestsReplayTheirModelEvaluators() throws {
        let rc=NativeLabInput.rc(resistanceOhm:2200,capacitanceF:0.002,supplyV:5,initialV:0.4)
        let heat=NativeLabInput.heat(diffusivityM2S:0.015,lengthM:1.5,backgroundK:290,centerK:360)
        for input in [rc,heat] {
            let manifest=try NativeWorldLabReplayManifest.make(input:input,
                worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",sampleTimesSeconds:samples)
            let replay=try NativeWorldLabReplayManifest.decodeAndReplay(manifest.encodeBounded())
            XCTAssertEqual(replay.samples.map{$0.timeSeconds},samples)
        }
    }

    func testFingerprintChangesWithInputsTimezoneAndSampleAxis() throws {
        let input=NativeLabInput.spring()
        let baseline=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",sampleTimesSeconds:samples)
        let changedInput=try NativeWorldLabReplayManifest.make(input:.spring(massKg:2),
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",sampleTimesSeconds:samples)
        let changedZone=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"Africa/Lagos",sampleTimesSeconds:samples)
        let changedSamples=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",sampleTimesSeconds:samples+[0.5])
        XCTAssertNotEqual(baseline.inputFingerprint,changedInput.inputFingerprint)
        XCTAssertNotEqual(baseline.inputFingerprint,changedZone.inputFingerprint)
        XCTAssertNotEqual(baseline.inputFingerprint,changedSamples.inputFingerprint)
    }

    func testTamperedParametersUnknownFieldsAndEventQueueAreRejected() throws {
        let manifest=try NativeWorldLabReplayManifest.make(input:.spring(),
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",sampleTimesSeconds:samples)
        let original=try JSONSerialization.jsonObject(with:manifest.encodeBounded()) as! [String:Any]
        var changed=original
        var parameters=changed["parameters"] as! [String:Any]
        parameters["massKg"]=3.0
        changed["parameters"]=parameters
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.decodeAndReplay(
            JSONSerialization.data(withJSONObject:changed)))
        changed=original
        changed["unexpectedState"]="do-not-restore"
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.decodeAndReplay(
            JSONSerialization.data(withJSONObject:changed)))
        changed=original
        changed["mandatoryEventTimesSeconds"]=[0.2]
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.decodeAndReplay(
            JSONSerialization.data(withJSONObject:changed)))
    }

    func testInvalidTimeZoneSampleAxisAndPayloadBoundsAreRejected() throws {
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.make(input:.spring(),
            worldEpochUTC:"bad",timezoneDisplay:"UTC",sampleTimesSeconds:samples))
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.make(input:.spring(),
            worldEpochUTC:"2026-11-01T00:00:00Z",timezoneDisplay:"UTC",
            sampleTimesSeconds:[0,0.2,0.1]))
        XCTAssertThrowsError(try NativeWorldLabReplayManifest.decodeAndReplay(
            Data(repeating:0,count:NativeWorldLabReplayManifest.maxBytes+1)))
    }
}


extension NativeWorldLabReplayManifestTests {
    func testPortableReplayFingerprintMatchesWebAndAndroidGoldenFixture() throws {
        let input=NativeLabInput.spring(massKg:2,springNPerM:8,dampingNsPerM:0.5,x0:0.25,v0:-0.1)
        let manifest=try NativeWorldLabReplayManifest.make(input:input,
            worldEpochUTC:"2026-11-01T00:00:00.000Z",timezoneDisplay:"UTC",
            sampleTimesSeconds:[0,0.1,0.2,0.3,0.4])
        XCTAssertEqual(manifest.inputFingerprint,"627da37ad5c8bfe2")
    }
}

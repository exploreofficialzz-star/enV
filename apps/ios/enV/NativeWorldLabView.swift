import SwiftUI
import SceneKit
import UniformTypeIdentifiers

private struct NativeWorldLabJsonFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var content: Data
    init(content: Data){self.content=content}
    init(configuration: ReadConfiguration) throws {
        let bytes=configuration.file.regularFileContents ?? Data()
        guard bytes.count <= NativeWorldLabPortableArchiveStore.maxBytes else {
            throw NativeWorldLabError.invalid("World Lab archive must be 24 MB or smaller")
        }
        content=bytes
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents:content)
    }
}

/// Native 3D *illustrative * scene with real, bounded local reference solvers.
/// Imported solids are never silently coupled to the scientific equations.
struct NativeWorldLabView:View {
    @State private var mode=0
    @State private var seconds=0.0
    @State private var speed=1.0
    @State private var playing=false
    @State private var mass=1.0
    @State private var resistance=1000.0
    @State private var diffusivity=0.02
    @State private var seeInside=false
    @State private var inspectionMode:NativeWorldLabInspectionMode = .normal
    @State private var inspectionOpacity=0.32
    @State private var inspectionAxis:NativeWorldLabInspectionAxis = .x
    @State private var inspectionCutawayFraction=0.0
    @State private var inspectionExplodeDistance=1.0
    @State private var showInspectionLabels=true
    @State private var showInspectionOverlays=true
    @State private var exportingTimelineCheckpoint=false
    @State private var importingTimelineCheckpoint=false
    @State private var timelineCheckpointFile:NativeWorldLabJsonFile?
    @State private var timelineStatus=""
    @State private var importing=false
    @State private var exporting=false
    @State private var exportingCAD=false
    @State private var importingCAD=false
    @State private var cadExchangeFile:NativeWorldLabJsonFile?
    @State private var exportingCompleteArchive=false
    @State private var completeArchiveFile:NativeWorldLabJsonFile?
    @State private var editHistory=NativeWorldLabEditHistory()
    @State private var projectData:Data?
    @State private var savedSnapshot:Data?
    @State private var recoveryDrafts:[NativeWorldLabProject]=[]
    @State private var recoveringDraftId=""
    @State private var deletingDraftId=""
    @State private var confirmingDraftDelete=false
    @State private var draftSaveTask:Task<Void,Never>?
    @State private var confirmation=false
    @State private var pendingReplacement=""
    @State private var inventedName=""
    @State private var inventedDensity=""
    @State private var inventedModulus=""
    @State private var inventedConductivity=""
    @State private var inventedSpecificHeat=""
    @State private var inventedRefraction=""
    @State private var opticalFirstId=""
    @State private var opticalSecondId=""
    @State private var opticalAngle="30"
    @State private var opticalRun:NativeOpticalInterfaceRun?
    @State private var opticalRayRun:NativeOpticalSceneRay?
    @State private var opticalRayOrigin="-4,0,0"
    @State private var opticalRayDirection="1,0,0"
    @State private var opticalRayDistance="10"
    @State private var opticalRayContacts="8"
    @State private var editingMaterialId:String?
    @State private var earthLatitude="0"
    @State private var earthLongitude="0"
    @State private var earthHeight="0"
    @State private var cadSketchWidth="2"
    @State private var cadSketchDepth="2"
    @State private var cadSketchHeight="1"
    @State private var cadSketchRadius="0.5"
    @State private var cadSketchX="0"
    @State private var cadSketchY="0"
    @State private var cadSketchZ="0"
    @State private var cadSketchRotationX="0"
    @State private var cadSketchRotationY="0"
    @State private var cadSketchRotationZ="0"
    @State private var beamForce="1000"
    @State private var beamRun:NativeLabBeamBendingResult?
    @State private var collisionOtherId=""
    @State private var collisionLeftSpeed="2"
    @State private var collisionRightSpeed="0"
    @State private var collisionRestitution=0.5
    @State private var collisionRun:NativeLabCollisionResult?
    @State private var exportingCollision=false
    @State private var collisionTime=0.0
    @State private var collisionPlaying=false
    @State private var collisionSpeed=1.0
    @State private var sphereOtherId=""
    @State private var sphereFirstVelocity="2,0,0"
    @State private var sphereSecondVelocity="0,0,0"
    @State private var sphereRestitution=0.65
    @State private var sphereRun:NativeSphereImpactResult?
    @State private var sphereTime=0.0
    @State private var spherePlaying=false
    @State private var sphereSpeed=1.0
    @State private var exportingSphereImpact=false
    @State private var heatFirstId=""
    @State private var heatSecondId=""
    @State private var heatFirstTemperature="400"
    @State private var heatSecondTemperature="300"
    @State private var heatDuration="100"
    @State private var heatTransferRun:NativeMaterialHeatRun?
    @State private var heatTransferTime=0.0
    @State private var heatTransferPlaying=false
    @State private var heatTransferSpeed=1.0
    @State private var exportingHeatTransfer=false
    @State private var gravitySpeeds:[String:String]=[:]
    @State private var gravitySelectionTouched=false
    @State private var gravitySelectedIds:Set<String>=[]
    @State private var gravityDuration=30.0
    @State private var gravitySteps=480
    @State private var scientificRecordIds:[String]=[]
    @State private var scientificRecordTitles:[String:String]=[:]
    @State private var selectedScientificRecordId=""
    @State private var exportingStoredScientificEvidence=false
    @State private var storedEvidenceFile:NativeWorldLabJsonFile?
    @State private var confirmingStoredScienceDelete=false
    @State private var gravityRun:NativeGravityRun?
    @State private var gravityTime=0.0
    @State private var gravityPlaying=false
    @State private var gravityRate=1.0
    @State private var exportingGravityEvidence=false
    @State private var groupSpeeds:[String:String]=[:]
    @State private var groupRestitution=1.0
    @State private var groupRun:NativeGroupSphereRun?
    @State private var groupTime=0.0
    @State private var groupPlaying=false
    @State private var groupPlaybackRate=1.0
    @State private var exportingGroupEvidence=false
    @State private var deviceName=""
    @State private var deviceAssumption=""
    @State private var deviceResistance=""
    @State private var junctionName=""
    @State private var positiveWire="supply"
    @State private var negativeWire="ground"
    @State private var gridSpacing=0.5
    @State private var measureTargetId=""
    @State private var assemblyName="My invention"
    @State private var assemblySecondId=""
    @State private var digitalShowCases=false
    @State private var savedProjects:[NativeWorldLabProject]=[]
    @State private var chosenSavedId=""
    @State private var confirmingDelete=false
    @State private var digitalNewGateName="Invented device"
    @State private var digitalAssumption="User-assumed Boolean behavior"
    @State private var digitalSourceA="input_a"
    @State private var digitalSourceB=""
    @State private var problem=""
    @State private var successMessage=""
    @State private var project:NativeWorldLabProject?
    @State private var dcRun:NativeLabDcResult?
    @State private var selected=0
    @State private var chemicalRun:NativeChemicalThermalResult?
    @State private var chemicalTime=0.0
    @State private var chemicalPlaying=false
    @State private var reactionHeat=50000.0
    @State private var reactionFactor=0.5
    @State private var reactionHeater=0.0
    @State private var hydroRun:NativeLabHydroResult?
    @State private var fluidMotion:NativeLabFluidMotionRun?
    @State private var fluidTime=0.0
    @State private var fluidPlaying=false
    @State private var fluidSurfaceHeight=1.0
    @State private var fluidDrag=200.0
    @State private var fluidDensity=1000.0
    @State private var fluidFraction=0.5
    @State private var dropRun:NativeDropResult?
    @State private var dropEntityId:String?
    @State private var dropTime=0.0
    @State private var dropPlaying=false
    @State private var dropSpeed=1.0
    @State private var motorRun:NativeActuatorResult?
    @State private var wiredMotor:NativeLabNetworkMotorRun?
    @State private var digitalMotor:NativeDigitalMotorResult?
    @State private var motorAudit:NativeActuatorNumericalAudit?
    @State private var motorEntityId:String?
    @State private var motorTime=0.0
    @State private var motorPlaying=false
    @State private var motorThermalEnabled=false
    @State private var motorSpeed=1.0
    @State private var scene=SCNScene()
    @State private var sceneCameraNode=SCNNode()
    @State private var observerVerticalOffset=0.0
    @State private var observerPanX=0.0
    @State private var observerPanZ=0.0
    @State private var appliedObserverVerticalOffset=0.0
    @State private var lastTick=Date()
    private let timer=Timer.publish(every:0.04,on:.main,in:.common).autoconnect()
    private let localProjects=NativeWorldLabProjectStore()
    private let savedScience=NativeWorldLabScientificEvidenceStore()
    private let portableArchives=NativeWorldLabPortableArchiveStore()
    private var hasUnsavedWork:Bool { projectData != nil && savedSnapshot != projectData }
    private func refreshScientificEvidence(){
        guard let project else{
            scientificRecordIds=[];scientificRecordTitles=[:];return
        }
        do{
            let records=try savedScience.list(project.id)
            scientificRecordIds=records.map{$0.id}
            scientificRecordTitles=Dictionary(uniqueKeysWithValues:records.map{
                ($0.id,$0.kind+" · "+$0.createdAt)
            })
        }catch{problem=error.localizedDescription}
    }
    private func retainGravityEvidence(){
        guard let project,let run=gravityRun else{return}
        do{
            _ = try savedScience.saveGravity(run,project:project)
            refreshScientificEvidence()
            problem="Gravity evidence preserved in private device history."
        }catch{problem=error.localizedDescription}
    }
    private func retainMaterialHeatEvidence(){
        guard let project,let run=heatTransferRun else{return}
        do{
            _ = try savedScience.saveHeat(run,project:project)
            refreshScientificEvidence()
            problem="Invented material heat evidence preserved on this device."
        }catch{problem=error.localizedDescription}
    }
    @ViewBuilder private func scientificEvidenceLibrary(
        project:NativeWorldLabProject)->some View {
        Text("Recorded scientific evidence").font(.headline)
        Text("Private gravity and thermal history. Save the invention " + "first; records are never silently uploaded or overwritten.")
            .font(.caption).foregroundStyle(.secondary)
        Button("Refresh scientific history"){refreshScientificEvidence()}
            .buttonStyle(.bordered)
        if scientificRecordIds.isEmpty {
            Text("No recorded gravity or material-contact studies on this device.")
                .font(.caption)
        }
        ForEach(scientificRecordIds,id:\.self){id in
            VStack(alignment:.leading,spacing:5){
                Text(scientificRecordTitles[id] ?? id).font(.caption)
                HStack {
                    Button("Export"){
                        do{
                            let bytes=try savedScience.read(project.id,id)
                            storedEvidenceFile=NativeWorldLabJsonFile(content:bytes)
                            selectedScientificRecordId=id
                            exportingStoredScientificEvidence=true
                        }catch{problem=error.localizedDescription}
                    }
                    Button("Discard",role:.destructive){
                        selectedScientificRecordId=id
                        confirmingStoredScienceDelete=true
                    }
                }.buttonStyle(.bordered)
            }
        }
    }
    private var materialHeatEvidenceDocument:NativeWorldLabJsonFile? {
        guard let run=heatTransferRun,let bytes=try? JSONEncoder().encode(run) else {
            return nil
        }
        return NativeWorldLabJsonFile(content:bytes)
    }
    private var gravityEvidenceDocument:NativeWorldLabJsonFile? {
        guard let run=gravityRun,let bytes=try? JSONEncoder().encode(run) else{return nil}
        return NativeWorldLabJsonFile(content:bytes)
    }
    private var groupEvidenceDocument:NativeWorldLabJsonFile? {
        guard let run=groupRun,
              let data=try? JSONEncoder().encode(run) else {return nil}
        return NativeWorldLabJsonFile(content:data)
    }
    private var sphereEvidenceDocument:NativeWorldLabJsonFile? {
        guard let run=sphereRun,
              let data=try? JSONEncoder().encode(run) else {return nil}
        return NativeWorldLabJsonFile(content:data)
    }
    private var collisionEvidenceDocument:NativeWorldLabJsonFile? {
        guard let run=collisionRun,
              let data=try? JSONEncoder().encode(run) else {return nil}
        return NativeWorldLabJsonFile(content:data)
    }
    private func prepareCompleteArchiveExport(){
        guard let data=projectData else{return}
        do{
            let archived=try portableArchives.export(data)
            completeArchiveFile=NativeWorldLabJsonFile(content:archived)
            exportingCompleteArchive=true
        }catch{problem=error.localizedDescription}
    }
    private func newProject(){
        do {
            let data=try NativeWorldLabEditor.blank()
            project=try NativeWorldLabProject.decode(data)
            projectData=data;savedSnapshot=nil;selected=0;editHistory.clear();problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func refreshRecoveryDrafts(){
        do {recoveryDrafts=try localProjects.listDrafts()}
        catch {problem=error.localizedDescription}
    }
    private func restoreRecoveryDraft(){
        do {
            guard !recoveringDraftId.isEmpty else{return}
            let record=try localProjects.readDraft(recoveringDraftId)
            let baseline=try? localProjects.read(recoveringDraftId).0
            projectData=record.0;project=record.1;savedSnapshot=baseline
            selected=0;editHistory.clear();problem="Recovered unfinished design. Save locally to commit."
            redraw()
        }catch{problem=error.localizedDescription}
    }
    private func discardRecoveryDraft(){
        do {
            try localProjects.deleteDraft(deletingDraftId)
            deletingDraftId="";refreshRecoveryDrafts()
        }catch{problem=error.localizedDescription}
    }
    private func scheduleRecoveryDraft(){
        draftSaveTask?.cancel()
        guard hasUnsavedWork,let data=projectData else{return}
        draftSaveTask=Task{
            try? await Task.sleep(nanoseconds:700_000_000)
            if Task.isCancelled{return}
            do {
                _ = try localProjects.saveDraft(data)
                refreshRecoveryDrafts()
            }catch{problem=error.localizedDescription}
        }
    }
    private func refreshSavedProjects(){
        do {
            savedProjects=try localProjects.listProjects()
            if !savedProjects.contains(where:{$0.id==chosenSavedId}) {
                chosenSavedId=savedProjects.first?.id ?? ""
            }
        }catch {problem=error.localizedDescription}
    }
    private func openSelectedProject(){
        do {
            guard !chosenSavedId.isEmpty else {
                throw NativeWorldLabError.invalid("Choose a saved World Lab project.")
            }
            let result=try localProjects.read(chosenSavedId)
            projectData=result.0;project=result.1;savedSnapshot=result.0
            editHistory.clear();selected=0;problem="";redraw()
        }catch {problem=error.localizedDescription}
    }
    private func deleteSelectedProject(){
        do {
            let deletedId=chosenSavedId
            guard !deletedId.isEmpty else {return}
            try localProjects.delete(deletedId)
            if project?.id==deletedId {savedSnapshot=nil}
            problem="";refreshSavedProjects()
        }catch {problem=error.localizedDescription}
    }
    private func loadSavedProject(){
        do {
            guard let saved=try localProjects.loadLatest() else {
                problem="There is no saved World Lab project on this device."
                return
            }
            projectData=saved.0;project=saved.1;savedSnapshot=saved.0;editHistory.clear()
            selected=0;problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func askToReplace(_ action:String){
        if hasUnsavedWork {pendingReplacement=action;confirmation=true}
        else if action=="new" {newProject()}
        else if action=="open" {loadSavedProject()}
        else if action=="open-selected" {openSelectedProject()}
        else if action=="import" {importing=true}
        else if action=="restore-draft" {restoreRecoveryDraft()}
    }
    private func saveLocally(){
        do {
            guard let data=projectData else {
                throw NativeWorldLabError.invalid("Create or import a project before saving.")
            }
            let baseline=try savedSnapshot.map{try NativeWorldLabProject.decode($0)}
            let current=try NativeWorldLabProject.decode(data)
            let expected=baseline?.id==current.id ? baseline?.revision : nil
            _ = try localProjects.save(data,expectedSavedRevision:expected)
            draftSaveTask?.cancel()
            try localProjects.deleteDraft(current.id)
            savedSnapshot=data;editHistory.clear();problem=""
            refreshSavedProjects();refreshRecoveryDrafts()
            refreshScientificEvidence()
        }catch{problem=error.localizedDescription}
    }
    private var input:NativeLabInput {
        if mode==0 {return .spring(massKg:mass)}
        if mode==1 {return .rc(resistanceOhm:resistance)}
        return .heat(diffusivityM2S:diffusivity)
    }
    private var values:NativeLabResult? {
        try? NativeWorldLabScience.evaluate(input,atSeconds:seconds)
    }
    private var solid:NativeLabSolid? {
        guard let project,project.entities.indices.contains(selected) else{return nil}
        return project.entities[selected]
    }
    private var material:NativeLabMaterial? {
        guard let solid else{return nil}
        return project?.materials.first(where:{$0.id==solid.materialId})
    }
    private var assumedMass:Double? {
        guard let solid,let density=material?.densityKgM3 else{return nil}
        return solid.volumeMetersCubed*density
    }
    private func applyProject(_ work:(Data)throws->Data){
        do {
            guard let old=projectData else {
                throw NativeWorldLabError.invalid("Create or import a project first.")
            }
            let data=try work(old)
            let validated=try NativeWorldLabProject.decode(data)
            try editHistory.record(before:old,after:data)
            project=validated
            projectData=data;dcRun=nil;wiredMotor=nil;digitalMotor=nil;hydroRun=nil;fluidPlaying=false;fluidMotion=nil;selected=min(selected,max(0,(project?.entities.count ?? 1)-1))
            problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func travelEdit(_ redo:Bool){
        do {
            guard let old=projectData else {
                throw NativeWorldLabError.invalid("Open a World Lab project first")
            }
            let next=try redo ? editHistory.redo(current:old) : editHistory.undo(current:old)
            guard let updated=next else {return}
            let restored=try NativeWorldLabProject.decode(updated)
            project=restored;projectData=updated
            dcRun=nil;wiredMotor=nil;digitalMotor=nil;hydroRun=nil
            fluidPlaying=false;fluidMotion=nil
            dropPlaying=false;dropRun=nil;motorPlaying=false;motorRun=nil
            collisionPlaying=false;collisionRun=nil;collisionTime=0
            spherePlaying=false;sphereRun=nil;sphereTime=0
            selected=min(selected,max(0,restored.entities.count-1))
            problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    var body:some View { importExportView }
    private var coreView:some View {
        ScrollView{
            VStack(alignment:.leading,spacing:12) {
                Text("The World Lab").font(.title2.bold())
                Text("Real bounded science models in a representative 3D scene. Not measured or certified.")
                    .font(.footnote).foregroundStyle(.secondary)
                SceneView(scene:scene,options:[.allowsCameraControl,.autoenablesDefaultLighting])
                    .frame(height:260).clipShape(RoundedRectangle(cornerRadius:12))
                    .accessibilityLabel("Interactive native 3D invention scene; drag to orbit and pinch to zoom.")
                if let project=project,let source=projectData {
                    NativeWorldLabMultiCadPanel(project:project,source:source){data in
                        applyProject{_ in data}
                    }
                }
                Text("Earth reference (WGS84)").font(.headline)
                Text("Set a mathematical local ENU origin. No terrain, imagery or device location is fetched.")
                    .font(.caption).foregroundStyle(.secondary)
                HStack{
                    TextField("Latitude °",text:$earthLatitude).keyboardType(.decimalPad)
                    TextField("Longitude °",text:$earthLongitude).keyboardType(.decimalPad)
                    TextField("Height m",text:$earthHeight).keyboardType(.decimalPad)
                }.textFieldStyle(.roundedBorder)
                HStack{
                    Button("Save Earth reference"){
                        do{
                            guard let lat=Double(earthLatitude),let lon=Double(earthLongitude),
                                  let h=Double(earthHeight) else {
                                throw NativeWorldLabError.invalid("Enter numeric WGS84 coordinates")
                            }
                            applyProject{try NativeWorldLabEditor.setGeodeticOrigin($0,
                                origin:NativeGeodetic(latitudeDegrees:lat,longitudeDegrees:lon,heightMeters:h))}
                        }catch{problem=error.localizedDescription}
                    }
                    Button("Clear reference"){
                        applyProject{try NativeWorldLabEditor.setGeodeticOrigin($0,origin:nil)}
                    }
                }.buttonStyle(.bordered)
                if let geo=project?.world.geodeticOrigin,
                   let ecef=try? NativeWorldLabGeodesy.toEcef(geo) {
                    Text("ECEF origin: "+String(format:"%.3f / %.3f / %.3f m",
                        ecef.xMeters,ecef.yMeters,ecef.zMeters)).font(.caption)
                }
                HStack{
                    Button("Zoom in"){zoomObserverView(factor:0.8)}.buttonStyle(.bordered)
                    Button("Zoom out"){zoomObserverView(factor:1.25)}.buttonStyle(.bordered)
                    Button("Save viewpoint"){saveObserverViewpoint()}.buttonStyle(.bordered)
                    Button("Restore viewpoint"){restoreObserverViewpoint()}.buttonStyle(.bordered)
                    Button("Surface"){returnObserverToSurface()}.buttonStyle(.bordered)
                }
                HStack{
                    Button("Look left"){orbitObserverView(yawDelta:-0.16,pitchDelta:0)}
                        .buttonStyle(.bordered).keyboardShortcut(.leftArrow)
                    Button("Look right"){orbitObserverView(yawDelta:0.16,pitchDelta:0)}
                        .buttonStyle(.bordered).keyboardShortcut(.rightArrow)
                    Button("Look up"){orbitObserverView(yawDelta:0,pitchDelta:0.10)}
                        .buttonStyle(.bordered).keyboardShortcut(.upArrow)
                    Button("Look down"){orbitObserverView(yawDelta:0,pitchDelta:-0.10)}
                        .buttonStyle(.bordered).keyboardShortcut(.downArrow)
                }
                HStack{
                    Button("Pan left"){panObserverView(horizontal:-observerPanStepMeters(),depth:0)}
                        .buttonStyle(.bordered)
                    Button("Pan right"){panObserverView(horizontal:observerPanStepMeters(),depth:0)}
                        .buttonStyle(.bordered)
                    Button("Pan forward"){panObserverView(horizontal:0,depth:observerPanStepMeters())}
                        .buttonStyle(.bordered)
                    Button("Pan back"){panObserverView(horizontal:0,depth:-observerPanStepMeters())}
                        .buttonStyle(.bordered)
                }
                Text("Observer distance: \(String(format: "%.2f", currentObserverRangeMeters())) m")
                    .font(.caption).foregroundStyle(.secondary)
                Text("Vertical observer offset: \(String(format: "%.1f",observerVerticalOffset)) m · illustrative volume, not mapped geology")
                    .font(.caption).foregroundStyle(.secondary)
                Slider(value:$observerVerticalOffset,in:-20000...20000)
                    .accessibilityLabel("World Lab observer vertical offset")
                    .onChange(of:observerVerticalOffset){_ in applyObserverVerticalOffset()}
                Picker("Experiment",selection:$mode){
                    Text("Spring").tag(0);Text("Circuit").tag(1);Text("Heat").tag(2)
                }.pickerStyle(.segmented)
                HStack(spacing:6){
                    Button("Beginning"){playing=false;seconds=0}
                        .buttonStyle(.bordered)
                    Button("Prev"){playing=false;seconds=max(0,seconds-1.0/240)}
                        .buttonStyle(.bordered)
                    Button(playing ? "Pause":"Play"){playing.toggle()}
                        .buttonStyle(.borderedProminent)
                    Button("Next"){playing=false;seconds=min(12,seconds+1.0/240)}
                        .buttonStyle(.bordered)
                    Button("End"){playing=false;seconds=12}
                        .buttonStyle(.bordered)
                }
                HStack{
                    Picker("Playback speed",selection:$speed){
                        Text("0.01×").tag(0.01);Text("0.1×").tag(0.1)
                        Text("1×").tag(1.0);Text("10×").tag(10.0);Text("100×").tag(100.0)
                    }.pickerStyle(.segmented)
                    Toggle("See inside",isOn:$seeInside).labelsHidden()
                    Text("See inside").font(.caption)
                }
                Picker("Inspection view",selection:$inspectionMode){
                    ForEach(NativeWorldLabInspectionMode.allCases){item in Text(item.title).tag(item)}
                }.pickerStyle(.menu)
                if inspectionMode == .transparent || inspectionMode == .xray || inspectionMode == .cutaway {
                    Text("Selected target opacity \(Int(inspectionOpacity*100))%").font(.caption)
                    Slider(value:$inspectionOpacity,in:0...1).accessibilityLabel("See Inside selected target opacity")
                }
                if inspectionMode == .cutaway {
                    Picker("Cutaway axis",selection:$inspectionAxis){
                        ForEach(NativeWorldLabInspectionAxis.allCases){axis in Text(axis.rawValue.uppercased()).tag(axis)}
                    }.pickerStyle(.segmented)
                    Text("Cutaway plane \(String(format:"%.2f",inspectionCutawayFraction))").font(.caption)
                    Slider(value:$inspectionCutawayFraction,in:-1...1).accessibilityLabel("Cutaway plane position")
                    Text("The selected primitive is clipped in world coordinates with a generated cut face.").font(.caption).foregroundStyle(.secondary)
                }
                if inspectionMode == .exploded {
                    Text("Assembly separation \(String(format:"%.1f",inspectionExplodeDistance)) m").font(.caption)
                    Slider(value:$inspectionExplodeDistance,in:0...10).accessibilityLabel("Exploded assembly separation")
                }
                HStack(spacing:6){
                    Button("Zoom to selected"){zoomToSelected()}.disabled(project?.entities.indices.contains(selected) != true)
                    Button(showInspectionLabels ? "Hide labels":"Show labels"){
                        showInspectionLabels.toggle()
                    }.accessibilityLabel(showInspectionLabels ? "Hide selected object labels":"Show selected object labels")
                    Button(showInspectionOverlays ? "Hide overlays":"Show overlays"){
                        showInspectionOverlays.toggle()
                    }
                    Button("Reset inspection"){
                        inspectionMode = .normal;seeInside=false;inspectionOpacity=0.32
                        inspectionAxis = .x;inspectionCutawayFraction=0
                        inspectionExplodeDistance=1;showInspectionLabels=true;showInspectionOverlays=true
                        redraw()
                    }
                }.buttonStyle(.bordered)
                if showInspectionOverlays,showInspectionLabels,
                   let project,project.entities.indices.contains(selected) {
                    Text("Selected: \(project.entities[selected].name) · \(project.entities[selected].shape)")
                        .font(.caption).foregroundStyle(.secondary)
                        .accessibilityElement(children:.combine)
                }
                if showInspectionOverlays,inspectionMode == .isolate,
                   project?.entities.indices.contains(selected) != true {
                    Text("Select a part first; the full scene remains visible until a valid selection exists.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                HStack{
                    Button(playing ? "Pause":"Play"){playing.toggle()}.buttonStyle(.borderedProminent)
                    Button("Beginning"){playing=false;seconds=0}.buttonStyle(.bordered)
                    Button("Previous step"){playing=false;seconds=max(0,seconds-1.0/240)}.buttonStyle(.bordered)
                    Button("Next step"){playing=false;seconds=min(12,seconds+1.0/240)}.buttonStyle(.bordered)
                    Button("End"){playing=false;seconds=12}.buttonStyle(.bordered)
                }
                Text("Simulated time: "+String(format:"%.2f",seconds)+" s")
                Slider(value:$seconds,in:0...12,onEditingChanged:{ editing in if editing{playing=false} }).accessibilityLabel("Simulated elapsed time")
                Picker("Playback speed",selection:$speed){
                    Text("0.01×").tag(0.01);Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0);Text("100×").tag(100.0)
                }.pickerStyle(.segmented)
                HStack {
                    Button("Save checkpoint"){prepareTimelineCheckpointExport()}.buttonStyle(.bordered)
                    Button("Restore checkpoint"){importingTimelineCheckpoint=true}.buttonStyle(.bordered)
                }
                if !timelineStatus.isEmpty {Text(timelineStatus).font(.caption).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently)}

                if mode==0 {
                    Text("Assumed mass: "+String(format:"%.2f",mass)+" kg")
                    Slider(value:$mass,in:0.1...100)
                }else if mode==1 {
                    Text("Resistance: "+String(format:"%.0f",resistance)+" Ω")
                    Slider(value:$resistance,in:100...10000)
                }else{
                    Text("Thermal diffusivity: "+String(format:"%.4f",diffusivity)+" m²/s")
                    Slider(value:$diffusivity,in:0.001...0.08)
                }
                Text("Computed observations").font(.headline)
                if let reading=values {
                    if mode==0 {
                        value("Position",reading.xMeters,"m")
                        value("Velocity",reading.velocityMPerS,"m/s")
                        value("Mechanical energy",reading.mechanicalEnergyJ,"J")
                    }else if mode==1 {
                        value("Capacitor voltage",reading.voltageV,"V")
                        value("Current",reading.currentA,"A")
                        value("Resistor heating",reading.resistorHeatW,"W")
                    }else{
                        value("Mean temperature",reading.meanTemperatureK,"K")
                        value("Hottest cell",reading.peakTemperatureK,"K")
                        if seeInside,let temps=reading.temperatureK {
                            Text("21 computed internal temperatures in kelvin:")
                                .font(.caption)
                            Text(temps.map{String(format:"%.1f",$0)}.joined(separator:", "))
                                .font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                }else{Text("Model exceeds its supported numerical limits.").foregroundStyle(.red)}
                if seeInside && mode != 2 {
                    Text("See inside is visual transparency, not an X-ray or molecular measurement.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let project=project {
                    NativeWorldLabElasticWavePanel(project:project)
                    NativeWorldLabRadiationPanel(project:project)
                    NativeWorldLabVehiclePanel(project:project)
                }
                Divider()
                HStack {
                    Button("New project"){askToReplace("new")}.buttonStyle(.borderedProminent)
                    Button("Export JSON"){exporting=true}
                        .buttonStyle(.bordered).disabled(projectData==nil)
                    Button("Export CAD geometry"){prepareCADExchangeExport()}
                        .buttonStyle(.bordered).disabled(projectData==nil || project?.entities.isEmpty != false)
                    Button("Export complete archive"){prepareCompleteArchiveExport()}
                        .buttonStyle(.bordered).disabled(projectData==nil)
                }
                HStack{
                    Button("Import project or archive"){askToReplace("import")}
                        .buttonStyle(.bordered)
                    Button("Import CAD geometry"){importingCAD=true}
                        .buttonStyle(.bordered).disabled(projectData==nil)
                }
                HStack {
                    Button("Save locally"){saveLocally()}
                        .buttonStyle(.borderedProminent).disabled(projectData==nil)
                    Button("Open last saved"){askToReplace("open")}.buttonStyle(.bordered)
                }
                if !savedProjects.isEmpty {
                    Picker("Saved World Lab projects",selection:$chosenSavedId){
                        ForEach(savedProjects,id:\.id){item in
                            Text(item.title+" · rev "+String(item.revision)).tag(item.id)
                        }
                    }.pickerStyle(.menu)
                    HStack {
                        Button("Open selected project"){askToReplace("open-selected")}
                            .buttonStyle(.bordered).disabled(chosenSavedId.isEmpty)
                        Button("Delete selected saved project",role:.destructive){
                            confirmingDelete=true
                        }.buttonStyle(.bordered).disabled(chosenSavedId.isEmpty)
                    }
                }
                if !recoveryDrafts.isEmpty {
                    Text("Recover unfinished inventions").font(.headline)
                    Text("Drafts are device-private. Restore only after explicit selection.")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(recoveryDrafts.prefix(10),id:\.id){draft in
                        HStack {
                            Text(draft.title).font(.caption)
                            Spacer()
                            Button("Restore"){
                                recoveringDraftId=draft.id;askToReplace("restore-draft")
                            }.buttonStyle(.bordered)
                            Button("Discard",role:.destructive){
                                deletingDraftId=draft.id;confirmingDraftDelete=true
                            }.buttonStyle(.bordered)
                        }
                    }
                }
                if hasUnsavedWork {
                    Text("Unsaved on this device. Save locally or export JSON to preserve these changes.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let project { projectContent(project) }
                if !successMessage.isEmpty {Text(successMessage).font(.caption).foregroundStyle(.secondary)}
                if !problem.isEmpty {Text(problem).foregroundStyle(.red)}
                Text("Model 1.0.0 · computed with assumed parameters · not a safety assessment.")
                    .font(.caption2).foregroundStyle(.secondary)
            }.padding(14)
        }
    }
    private var sceneSettingsView:some View {
        coreView
        .onAppear{redraw();lastTick=Date();refreshSavedProjects();
            refreshRecoveryDrafts();refreshScientificEvidence()}
        .onChange(of:mode){_ in seconds=0;playing=false;redraw()}
        .onChange(of:seconds){_ in redraw()}
        .onChange(of:dropTime){_ in applyDropPosition()}
        .onChange(of:fluidTime){_ in applyFluidPosition()}
        .onChange(of:motorTime){_ in applyMotorPosition()}
        .onChange(of:seeInside){_ in
            if seeInside && inspectionMode == .normal {inspectionMode = .transparent}
            else if !seeInside && inspectionMode == .transparent {inspectionMode = .normal}
            redraw()
        }
        .onChange(of:inspectionMode){value in seeInside=value == .transparent || value == .xray || value == .cutaway;redraw()}
        .onChange(of:inspectionOpacity){_ in redraw()}
        .onChange(of:inspectionAxis){_ in redraw()}
        .onChange(of:inspectionCutawayFraction){_ in redraw()}
        .onChange(of:inspectionExplodeDistance){_ in redraw()}
        .onChange(of:mass){_ in redraw()}
        .onChange(of:resistance){_ in redraw()}
        .onChange(of:diffusivity){_ in redraw()}
    }
    private var interactionView:some View {
        sceneSettingsView
        .onChange(of:reactionHeat){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:reactionFactor){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:reactionHeater){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:fluidDensity){_ in
            hydroRun=nil;fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidSurfaceHeight){_ in
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidDrag){_ in
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidFraction){_ in hydroRun=nil }
        .onChange(of:projectData){_ in
            scheduleRecoveryDraft()
            refreshScientificEvidence()
            gravityRun=nil;gravityPlaying=false;gravityTime=0
            heatTransferRun=nil;heatTransferPlaying=false;heatTransferTime=0
            // Never reuse a prior computed trajectory after geometry/material edits.
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
            beamRun=nil
            collisionPlaying=false;collisionRun=nil;collisionTime=0
            groupPlaying=false;groupRun=nil;groupTime=0
            dropPlaying=false;dropRun=nil;dropEntityId=nil;dropTime=0
            motorPlaying=false;motorRun=nil;digitalMotor=nil;motorEntityId=nil;motorTime=0;redraw()
        }
        .confirmationDialog("Discard saved scientific evidence?",
            isPresented:$confirmingStoredScienceDelete,titleVisibility:.visible){
            Button("Discard scientific record",role:.destructive){
                if let project {
                    do{
                        try savedScience.delete(project.id,selectedScientificRecordId)
                        refreshScientificEvidence()
                        problem="Removed this local scientific record only."
                    }catch{problem=error.localizedDescription}
                }
            }
            Button("Cancel",role:.cancel){}
        }message:{
            Text("The invention and exported files remain unchanged.")
        }
        .confirmationDialog("Discard cached World Lab draft?",
            isPresented:$confirmingDraftDelete,titleVisibility:.visible){
            Button("Discard recovery draft",role:.destructive){discardRecoveryDraft()}
            Button("Cancel",role:.cancel){}
        }message:{
            Text("Only the selected cached draft is removed, not any saved project.")
        }
        .confirmationDialog("Delete selected saved World Lab project?",
            isPresented:$confirmingDelete,titleVisibility:.visible){
            Button("Delete saved project",role:.destructive){deleteSelectedProject()}
            Button("Cancel",role:.cancel){}
        }message:{
            Text("Only the selected local-device copy is deleted. Export JSON first if needed.")
        }
        .onReceive(timer){now in
            let dt=max(0,min(0.25,now.timeIntervalSince(lastTick)))
            lastTick=now
            if playing {seconds=min(12,seconds+dt*speed);if seconds>=12{playing=false}}
            if motorPlaying,let run=motorRun {
                motorTime=min(run.samples.last?.timeSeconds ?? 4,motorTime+dt*motorSpeed)
                if motorTime >= (run.samples.last?.timeSeconds ?? 4){motorPlaying=false}
            }
            if chemicalPlaying,let run=chemicalRun {
                chemicalTime=min(run.samples.last?.timeSeconds ?? 6,
                    chemicalTime+dt)
                if chemicalTime >= (run.samples.last?.timeSeconds ?? 6){
                    chemicalPlaying=false
                }
            }
            if fluidPlaying,let run=fluidMotion {
                fluidTime=min(run.samples.last?.timeSeconds ?? 4,fluidTime+dt)
                if fluidTime >= (run.samples.last?.timeSeconds ?? 4) {
                    fluidPlaying=false
                }
            }
            if heatTransferPlaying,let run=heatTransferRun {
                heatTransferTime=min(run.durationSeconds,
                    heatTransferTime+dt*heatTransferSpeed)
                updateHeatTransferScene()
                if heatTransferTime>=run.durationSeconds {heatTransferPlaying=false}
            }
            if gravityPlaying,let run=gravityRun {
                gravityTime=min(run.durationSeconds,gravityTime+dt*gravityRate)
                updateGravityScene()
                if gravityTime>=run.durationSeconds {gravityPlaying=false}
            }
            if groupPlaying,let run=groupRun {
                groupTime=NativeWorldLabTime.next(current:groupTime,elapsed:dt,rate:groupPlaybackRate,duration:run.durationSeconds,events:run.events.map{$0.atSeconds})
                updateGroupSphereScene()
                if groupTime>=run.durationSeconds {groupPlaying=false}
            }
            if spherePlaying,let run=sphereRun {
                sphereTime=NativeWorldLabTime.next(current:sphereTime,elapsed:dt,rate:sphereSpeed,duration:run.durationSeconds,events:[run.impactTimeSeconds])
                updateSphereScene()
                if sphereTime>=run.durationSeconds {spherePlaying=false}
            }
            if collisionPlaying,let run=collisionRun {
                collisionTime=NativeWorldLabTime.next(current:collisionTime,elapsed:dt,rate:collisionSpeed,duration:run.durationSeconds,events:[run.impactTimeSeconds])
                updateCollisionScene()
                if collisionTime>=run.durationSeconds {collisionPlaying=false}
            }
            if dropPlaying,let run=dropRun {
                dropTime=min(run.samples.last?.timeSeconds ?? 6,dropTime+dt*dropSpeed)
                if dropTime >= (run.samples.last?.timeSeconds ?? 6){dropPlaying=false}
            }
        }
        .confirmationDialog("Discard unsaved changes?",isPresented:$confirmation,
                            titleVisibility:.visible) {
            Button("Discard and continue",role:.destructive){
                if pendingReplacement=="new" {newProject()}
                else if pendingReplacement=="open" {loadSavedProject()}
                else if pendingReplacement=="open-selected" {openSelectedProject()}
                else if pendingReplacement=="import" {importing=true}
                else if pendingReplacement=="restore-draft" {restoreRecoveryDraft()}
                pendingReplacement=""
            }
            Button("Keep editing",role:.cancel){pendingReplacement=""}
        } message: {
            Text("Save locally or export JSON first if you want to keep the current changes.")
        }
    }

    private func prepareCADExchangeExport(){
        guard let data=projectData else{return}
        do{
            cadExchangeFile=NativeWorldLabJsonFile(content:try NativeWorldLabEditor.exportCADExchange(data))
            exportingCAD=true;problem="";successMessage=""
        }catch{problem=error.localizedDescription}
    }

    private func prepareTimelineCheckpointExport(){
        do {
            let id=mode==0 ? "spring" : mode==1 ? "rc" : "heat"
            let checkpoint=try NativeWorldLabDemoCheckpoint.make(modelId:id,timeSeconds:seconds,
                massKg:mass,springNPerM:4,resistanceOhm:resistance,diffusivityM2PerS:diffusivity)
            timelineCheckpointFile=NativeWorldLabJsonFile(content:try checkpoint.encodeBounded())
            exportingTimelineCheckpoint=true;timelineStatus=""
        }catch{problem=error.localizedDescription;timelineStatus=""}
    }
    private func restoreTimelineCheckpoint(_ data:Data)throws {
        let checkpoint=try NativeWorldLabDemoCheckpoint.decodeBounded(data)
        mode=checkpoint.modelId=="spring" ? 0 : checkpoint.modelId=="rc" ? 1 : 2
        seconds=checkpoint.timeSeconds;mass=checkpoint.massKg;resistance=checkpoint.resistanceOhm
        diffusivity=checkpoint.diffusivityM2PerS
        playing=false;lastTick=Date();redraw()
        timelineStatus="Matching reference experiment parameters and time restored."
    }
    private var importExportView:some View {
        interactionView
        .fileExporter(isPresented:$exportingTimelineCheckpoint,document:timelineCheckpointFile,
            contentType:.json,defaultFilename:"world-lab-time-checkpoint"){result in
                if case .failure(let error)=result{problem=error.localizedDescription}
                timelineCheckpointFile=nil
            }
        .fileImporter(isPresented:$importingTimelineCheckpoint,allowedContentTypes:[.json]){result in
            do{
                let url=try result.get()
                let accessed=url.startAccessingSecurityScopedResource()
                defer{if accessed{url.stopAccessingSecurityScopedResource()}}
                let attrs=try FileManager.default.attributesOfItem(atPath:url.path)
                guard let count=(attrs[.size] as? NSNumber)?.intValue,count<=16*1024 else{
                    throw NativeWorldLabError.invalid("Timeline checkpoints must be 16 KB or smaller")
                }
                try restoreTimelineCheckpoint(Data(contentsOf:url))
                problem=""
            }catch{problem=error.localizedDescription;timelineStatus=""}
        }
        .fileExporter(isPresented:$exporting,
            document:projectData.map{NativeWorldLabJsonFile(content:$0)},
            contentType:.json,defaultFilename:"world-lab-project"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileExporter(isPresented:$exportingCAD,document:cadExchangeFile,
            contentType:.json,defaultFilename:"world-lab-cad-geometry"){result in
                if case .failure(let error)=result{problem=error.localizedDescription;successMessage=""}
                else{successMessage="Supported CAD geometry exported in metres and LOCAL_ENU coordinates."}
                cadExchangeFile=nil
            }
        .fileExporter(isPresented:$exportingCompleteArchive,
            document:completeArchiveFile,contentType:.json,
            defaultFilename:"world-lab-complete-archive"){result in
                if case .failure(let error)=result{problem=error.localizedDescription}
                completeArchiveFile=nil
            }
        .fileExporter(isPresented:$exportingStoredScientificEvidence,
            document:storedEvidenceFile,contentType:.json,
            defaultFilename:"world-lab-scientific-evidence"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
                storedEvidenceFile=nil
            }
        .fileExporter(isPresented:$exportingHeatTransfer,
            document:materialHeatEvidenceDocument,contentType:.json,
            defaultFilename:"world-lab-material-heat-evidence"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileExporter(isPresented:$exportingGravityEvidence,
            document:gravityEvidenceDocument,contentType:.json,
            defaultFilename:"world-lab-newtonian-gravity-evidence"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileExporter(isPresented:$exportingGroupEvidence,
            document:groupEvidenceDocument,contentType:.json,
            defaultFilename:"world-lab-multi-sphere-evidence"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileExporter(isPresented:$exportingSphereImpact,
            document:sphereEvidenceDocument,contentType:.json,
            defaultFilename:"world-lab-spatial-sphere-impact"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileExporter(isPresented:$exportingCollision,
            document:collisionEvidenceDocument,contentType:.json,
            defaultFilename:"world-lab-two-body-collision-evidence"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileImporter(isPresented:$importingCAD,allowedContentTypes:[.json]){response in
            do{
                let url=try response.get()
                let accessed=url.startAccessingSecurityScopedResource()
                defer{if accessed{url.stopAccessingSecurityScopedResource()}}
                let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
                guard let count=(attributes[.size] as? NSNumber)?.intValue,
                      count<=NativeWorldLabProject.maxBytes else{
                    throw NativeWorldLabError.invalid("CAD geometry files must be 1 MB or smaller")
                }
                let cadData=try Data(contentsOf:url)
                guard let current=projectData else{
                    throw NativeWorldLabError.invalid("Create or open an invention before importing CAD geometry")
                }
                let imported=try NativeWorldLabEditor.importCADExchange(current,cadData:cadData)
                let updated=try NativeWorldLabProject.decode(imported)
                projectData=imported;project=updated
                editHistory=NativeWorldLabEditHistory()
                chosenSavedId=updated.id
                problem=""
                successMessage="CAD geometry merged into the current invention. Save locally to preserve it."
            }catch{problem=error.localizedDescription;successMessage=""}
        }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.json]){response in
            do {
                let url=try response.get()
                let accessed=url.startAccessingSecurityScopedResource()
                defer{if accessed{url.stopAccessingSecurityScopedResource()}}
                // File-size metadata must be available and bounded before
                // allocating memory for untrusted imported project contents.
                let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
                guard let length=(attributes[.size] as? NSNumber)?.intValue,
                      length<=NativeWorldLabPortableArchiveStore.maxBytes else {
                    throw NativeWorldLabError.invalid(
                        "Imported project or archive must be 24 MB or smaller.")
                }
                let data=try Data(contentsOf:url)
                let raw=try JSONSerialization.jsonObject(with:data) as? [String:Any]
                if raw?["format"] as? String=="env-world-lab-archive" {
                    let archive=try portableArchives.importArchive(data)
                    project=archive.project
                    projectData=archive.projectData
                    savedSnapshot=archive.projectData
                    problem="Imported and saved complete invention archive. " + "Older numerical experiments were preserved for re-export."
                    refreshSavedProjects();refreshScientificEvidence()
                }else{
                    guard data.count<=NativeWorldLabProject.maxBytes else {
                        throw NativeWorldLabError.invalid(
                            "Standalone projects must be 1 MB or smaller")
                    }
                    project=try NativeWorldLabProject.decode(data)
                    projectData=data
                    savedSnapshot=nil
                    problem=""
                }
                editHistory.clear()
                selected=0;redraw()
            }catch{problem=error.localizedDescription}
        }
    }
    private func value(_ name: String, _ amount: Double?, _ unit: String) -> some View {
        let displayed: String
        if let amount = amount {
            displayed = String(format: "%.5g", amount)
        } else {
            displayed = "Unknown"
        }
        let caption = name + ": " + displayed + " " + unit
        return Text(verbatim: caption).font(.subheadline)
    }

    @ViewBuilder private func digitalContent(_ project:NativeWorldLabProject)->some View {
        Text("Invent digital logic").font(.headline)
        Text("Boolean truth tables from your assumptions, not measured chip behavior.")
            .font(.caption).foregroundStyle(.secondary)
        if let network=project.digitalNetworks?.first {
            ForEach(network.inputs,id:\.id){input in
                Toggle(input.label,isOn:Binding(
                    get:{input.value},
                    set:{newValue in
                        applyProject{try NativeWorldLabEditor.digitalSwitch(
                            $0,networkId:network.id,inputId:input.id,value:newValue)}
                    }))
            }
            ForEach(network.gates,id:\.id){gate in
                Text(gate.name+" · "+gate.assumption).font(.caption)
                ForEach(gate.truthTable.indices,id:\.self){index in
                    let bit=gate.truthTable[index]
                    HStack{
                        Text(String(repeating:"0",count:max(0,gate.inputNodeIds.count - String(index,radix:2).count)) + String(index,radix:2))
                        Spacer()
                        Button("Output "+String(bit)+" · toggle"){
                            applyProject{try NativeWorldLabEditor.digitalTruthBit(
                                $0,networkId:network.id,gateId:gate.id,
                                row:index,bit:1-bit)}
                        }.buttonStyle(.bordered)
                    }
                }
            }
            TextField("Name your invented digital gate",text:$digitalNewGateName)
                .textFieldStyle(.roundedBorder)
            TextField("Assumed Boolean behavior",text:$digitalAssumption)
                .textFieldStyle(.roundedBorder)
            Picker("First digital input",selection:$digitalSourceA){
                ForEach(network.inputs,id:\.id){node in Text(node.label).tag(node.id)}
                ForEach(network.gates,id:\.id){node in Text(node.name).tag(node.id)}
            }.pickerStyle(.menu)
            Picker("Optional second digital input",selection:$digitalSourceB){
                Text("None").tag("")
                ForEach(network.inputs,id:\.id){node in Text(node.label).tag(node.id)}
                ForEach(network.gates,id:\.id){node in Text(node.name).tag(node.id)}
            }.pickerStyle(.menu)
            let available=network.inputs.map(\.id)+network.gates.map(\.id)
            let ports=[digitalSourceA]+(digitalSourceB.isEmpty ? [] : [digitalSourceB])
            Button("Connect a new invented gate"){
                applyProject{try NativeWorldLabEditor.addDigitalGate(
                    $0,networkId:network.id,name:digitalNewGateName,
                    assumption:digitalAssumption,inputNodeIds:ports)}
            }.buttonStyle(.bordered)
                .disabled(digitalNewGateName.trimmingCharacters(
                    in:.whitespacesAndNewlines).isEmpty ||
                    digitalAssumption.trimmingCharacters(
                    in:.whitespacesAndNewlines).isEmpty ||
                    network.gates.count>=32 || Set(ports).count != ports.count ||
                    !ports.allSatisfy({available.contains($0)}))
            Text("Choose upstream signals, edit each truth-table row, and connect an indicator.")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(network.outputs,id:\.id){output in
                Picker(output.label+" reads",selection:Binding<String>(
                    get:{output.sourceNodeId},
                    set:{newSource in
                        applyProject{try NativeWorldLabEditor.digitalOutputSource(
                            $0,networkId:network.id,outputId:output.id,
                            sourceNodeId:newSource)}
                    })){
                    ForEach(network.inputs,id:\.id){input in
                        Text(input.label).tag(input.id)
                    }
                    ForEach(network.gates,id:\.id){gate in
                        Text(gate.name).tag(gate.id)
                    }
                }.pickerStyle(.menu)
                    .accessibilityLabel("Wire "+output.label+" to digital node")
            }
            Button(digitalShowCases ? "Hide all logic cases":"Check every input combination"){
                digitalShowCases.toggle()
            }.buttonStyle(.bordered)
            if digitalShowCases {
                if let cases=try? NativeWorldLabDigitalLogic.truthTable(network) {
                    Text("Checked "+String(cases.count)+" assumed Boolean combinations.")
                        .font(.caption)
                    ForEach(0..<min(16,cases.count),id:\.self){index in
                        let indexBits=String(index,radix:2)
                        let label=String(repeating:"0",
                            count:max(0,network.inputs.count-indexBits.count)) + indexBits
                        let bits=network.outputs.map{String(cases[index][$0.id] ?? 0)}
                            .joined()
                        Text(label+" → "+bits).font(.caption.monospaced())
                    }
                    if cases.count>16 {
                        Text("First 16 shown. Full limit is 256 input cases.")
                            .font(.caption)
                    }
                }else {
                    Text("Exhaustive check supports at most eight switches.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let values=try? NativeWorldLabDigitalLogic.evaluate(network) {
                ForEach(network.outputs,id:\.id){output in
                    Text(output.label+": "+String(values[output.id] ?? 0))
                }
            }else {Text("Digital network could not be calculated.")}
        }else {
            Button("Start invented logic"){
                applyProject{try NativeWorldLabEditor.startDigitalInvention($0)}
            }.buttonStyle(.bordered)
        }
    }
    @ViewBuilder private func projectContent(_ project:NativeWorldLabProject)->some View {
        Text(project.title+" · "+String(project.entities.count)+" solids").font(.headline)
        digitalContent(project)
        chemicalContent()
        Text("Connected DC circuits").font(.headline)
        if let circuit=project.networks?.first {
            circuitContent(circuit,project:project)
        }else{
            Button("Build first circuit"){
                applyProject{try NativeWorldLabEditor.starterCircuit($0)}
            }.buttonStyle(.bordered)
        }
        projectShapeButtons(project)
        projectAssemblyControls(project)
        projectHistoryControls(project)
        projectMaterialControls(project)
    }
    @ViewBuilder private func projectShapeButtons(_ project:NativeWorldLabProject)->some View {
                    HStack(spacing:8){
                        Button("Add cube"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"box")}}
                        Button("Add sphere"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"sphere")}}
                        Button("Add cylinder"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"cylinder")}}
                    }.buttonStyle(.bordered).disabled(project.entities.count>=200)
    }
    @ViewBuilder private func projectAssemblyControls(_ project:NativeWorldLabProject)->some View {
                    Text("Build from visual parts").font(.headline)
                    Text("Connect solid shapes for coordinated movement, not a calculated mechanical joint.")
                        .font(.caption).foregroundStyle(.secondary)
                    if let chosen=solid {
                        let available=project.entities.filter{candidate in
                            candidate.id != chosen.id && !(project.assemblies ?? []).contains(where:{
                                $0.entityIds.contains(candidate.id)
                            })
                        }
                        TextField("Assembly name",text:$assemblyName)
                            .textFieldStyle(.roundedBorder)
                        Picker("Second part",selection:$assemblySecondId){
                            Text("Choose a second solid").tag("")
                            ForEach(available,id:\.id){candidate in
                                Text(candidate.name).tag(candidate.id)
                            }
                        }.pickerStyle(.menu)
                        Button("Group these parts"){
                            applyProject{try NativeWorldLabEditor.createVisualAssembly(
                                $0,name:assemblyName,
                                entityIds:[chosen.id,assemblySecondId])}
                        }.buttonStyle(.bordered)
                            .disabled(assemblySecondId.isEmpty ||
                                !available.contains(where:{$0.id==assemblySecondId}) ||
                                assemblyName.isEmpty ||
                                (project.assemblies?.count ?? 0)>=50 ||
                                (project.assemblies ?? []).contains(where:{
                                    $0.entityIds.contains(chosen.id)
                                }))
                    }
                    ForEach(project.assemblies ?? [],id:\.id){group in
                        VStack(alignment:.leading,spacing:6){
                            Text(group.name+" · "+String(group.entityIds.count)+" parts")
                                .font(.subheadline)
                            HStack {
                                ForEach(0..<3,id:\.self){axis in
                                    Button("Move +"+["X","Y","Z"][axis]){
                                        var delta=[0.0,0.0,0.0]
                                        delta[axis]=0.5
                                        applyProject{try NativeWorldLabEditor.moveVisualAssembly(
                                            $0,id:group.id,deltaMeters:delta)}
                                    }
                                }
                            }.buttonStyle(.bordered)
                            Button("Ungroup safely"){
                                applyProject{try NativeWorldLabEditor.ungroupVisualAssembly(
                                    $0,id:group.id)}
                            }.buttonStyle(.bordered)
                        }
                    }
    }
    @ViewBuilder private func projectHistoryControls(_ project:NativeWorldLabProject)->some View {
                    HStack {
                        Button("Undo"){travelEdit(false)}.disabled(!editHistory.canUndo)
                        Button("Redo"){travelEdit(true)}.disabled(!editHistory.canRedo)
                    }.buttonStyle(.bordered)
                    if let solid { solidContent(project:project,solid:solid) }
    }
    @ViewBuilder private func projectMaterialControls(_ project:NativeWorldLabProject)->some View {
                    if let solid,
                       let attached=project.materials.first(where:{$0.id==solid.materialId}){
                        Button("Revise this material's assumptions"){
                            editingMaterialId=attached.id
                            inventedName=attached.name
                            inventedDensity=attached.densityKgM3.map{String($0)} ?? ""
                            inventedModulus=attached.youngModulusPa.map{String($0)} ?? ""
                            inventedConductivity=attached.thermalConductivityWPerMK.map{
                                String($0)} ?? ""
                            inventedSpecificHeat=attached.specificHeatJPerKgK.map{
                                String($0)} ?? ""
                            inventedRefraction=attached.refractiveIndex.map{String($0)} ?? ""
                        }.buttonStyle(.bordered)
                    }
                    TextField("Invented material name",text:$inventedName)
                        .textFieldStyle(.roundedBorder)
                    TextField("Assumed density in kg/m³ (optional)",text:$inventedDensity)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Assumed Young's modulus in Pa (optional)",text:$inventedModulus)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Assumed conductivity W/(m K) (optional)",
                              text:$inventedConductivity)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Assumed specific heat J/(kg K) (optional)",
                              text:$inventedSpecificHeat)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Assumed optical index 1–5 (optional)",text:$inventedRefraction)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    Button(editingMaterialId==nil ? "Save invented material" : "Save revised material") {
                        do {
                            guard !inventedName.trimmingCharacters(in:.whitespaces).isEmpty else{
                                throw NativeWorldLabError.invalid("Name your invented material.")
                            }
                            let density:Double?
                            if inventedDensity.trimmingCharacters(in:.whitespaces).isEmpty{
                                density=nil
                            }else if let number=Double(inventedDensity){density=number}
                            else {throw NativeWorldLabError.invalid("Density must be a finite number.")}
                            let modulus:Double?
                            if inventedModulus.trimmingCharacters(in:.whitespaces).isEmpty {
                                modulus=nil
                            }else if let value=Double(inventedModulus) {modulus=value}
                            else {throw NativeWorldLabError.invalid("Young's modulus must be numeric")}
                            let conductivity=inventedConductivity.trimmingCharacters(
                                in:.whitespaces).isEmpty ? nil : Double(inventedConductivity)
                            let heatCapacity=inventedSpecificHeat.trimmingCharacters(
                                in:.whitespaces).isEmpty ? nil : Double(inventedSpecificHeat)
                            let refraction=inventedRefraction.trimmingCharacters(
                                in:.whitespaces).isEmpty ? nil : Double(inventedRefraction)
                            if !inventedRefraction.trimmingCharacters(in:.whitespaces).isEmpty && refraction==nil {
                                throw NativeWorldLabError.invalid("Optical index must be numeric")
                            }
                            if !inventedConductivity.trimmingCharacters(in:.whitespaces).isEmpty && conductivity==nil {
                                throw NativeWorldLabError.invalid("Conductivity must be numeric")
                            }
                            if !inventedSpecificHeat.trimmingCharacters(in:.whitespaces).isEmpty && heatCapacity==nil {
                                throw NativeWorldLabError.invalid("Specific heat must be numeric")
                            }
                            let id=UUID().uuidString
                            applyProject {old in
                                if let editingMaterialId {
                                    return try NativeWorldLabEditor.reviseHypotheticalMaterial(
                                        old,id:editingMaterialId,name:inventedName,
                                        densityKgM3:density,youngModulusPa:modulus,
                                        thermalConductivityWPerMK:conductivity,
                                        specificHeatJPerKgK:heatCapacity,
                                        refractiveIndex:refraction)
                                }
                                let first=try NativeWorldLabEditor.addHypotheticalMaterial(
                                    old,name:inventedName,densityKgM3:density,
                                    youngModulusPa:modulus,id:id,
                                    thermalConductivityWPerMK:conductivity,
                                    specificHeatJPerKgK:heatCapacity,
                                        refractiveIndex:refraction)
                                if let solid {
                                    return try NativeWorldLabEditor.assignMaterial(
                                        first,solidId:solid.id,materialId:id)
                                }
                                return first
                            }
                            if problem.isEmpty {
                                inventedName="";inventedDensity="";inventedModulus=""
                                inventedConductivity="";inventedSpecificHeat="";inventedRefraction=""
                                editingMaterialId=nil;beamRun=nil
                            }
                        }catch{problem=error.localizedDescription}
                    }.buttonStyle(.borderedProminent)
                    if editingMaterialId != nil {
                        Button("Cancel material revision"){
                            editingMaterialId=nil
                            inventedName="";inventedDensity="";inventedModulus=""
                        }.buttonStyle(.bordered)
                    }
                    Text("An invented Young's modulus can power a bounded analytical beam model. Unknown strength, fractures and chemical behavior remain unverified.")
                        .font(.caption).foregroundStyle(.secondary)
                
    }
    @ViewBuilder private func chemicalContent()->some View {
Text("Invent chemical heat").font(.headline)
                    Text("Invent assumed reaction properties; the model cannot identify real chemicals.")
                        .font(.caption).foregroundStyle(.secondary)
                    value("Assumed heat released",reactionHeat,"J/mol")
                    Slider(value:$reactionHeat,in:-50000...100000)
                        .accessibilityLabel("Hypothetical reaction heat")
                    value("Assumed reaction factor",reactionFactor,"1/s")
                    Slider(value:$reactionFactor,in:0...5)
                        .accessibilityLabel("Hypothetical reaction factor")
                    value("External heater",reactionHeater,"W")
                    Slider(value:$reactionHeater,in:-200...200)
                        .accessibilityLabel("External reaction heater power")
                    Button("Calculate reaction temperature"){
                        do {
                            var input=NativeChemicalThermalInput()
                            input.reactionHeatReleasedJPerMol=reactionHeat
                            input.preExponentialPerS=reactionFactor
                            input.externalHeatingW=reactionHeater
                            chemicalRun=try NativeWorldLabChemicalThermal.evaluate(input)
                            chemicalTime=0;chemicalPlaying=true;problem=""
                        }catch{
                            chemicalRun=nil;chemicalPlaying=false
                            problem=error.localizedDescription
                        }
                    }.buttonStyle(.bordered)
                    if let chemical=chemicalRun,!chemical.samples.isEmpty {
                        let index=max(0,min(chemical.samples.count-1,
                            Int((chemicalTime/chemical.stepSeconds).rounded())))
                        let observation=chemical.samples[index]
                        value("Reaction time",observation.timeSeconds,"s")
                        value("Converted amount",observation.productFormedMol,"mol")
                        value("Computed temperature",observation.temperatureK,"K")
                        value("Reaction thermal power",observation.reactionPowerW,"W")
                        value("Energy residual",observation.energyResidualJ,"J")
                        Slider(value:$chemicalTime,
                            in:0...(chemical.samples.last?.timeSeconds ?? 6)) { editing in
                            if editing {chemicalPlaying=false}
                        }.accessibilityLabel("Explore chemical time")
                        HStack {
                            Button(chemicalPlaying ? "Pause reaction":"Play reaction"){
                                chemicalPlaying.toggle()
                            }
                            Button("Reset reaction"){chemicalPlaying=false;chemicalTime=0}
                            Button("Step reaction"){
                                chemicalPlaying=false
                                chemicalTime=min(
                                    chemical.samples.last?.timeSeconds ?? 6,
                                    chemicalTime+chemical.stepSeconds)
                            }
                        }.buttonStyle(.bordered)
                        Text(chemical.validity).font(.caption).foregroundStyle(.secondary)
                    }
                    
    }
    @ViewBuilder private func circuitContent(_ circuit:NativeLabCircuitNetwork,
        project:NativeWorldLabProject)->some View {

                        Text(circuit.name+" · "+String(circuit.components.count)+" wired parts")
                            .font(.caption)
                        HStack {
                            Button("Add parallel resistor") {
                                applyProject{try NativeWorldLabEditor.addParallelResistor($0)}
                            }.disabled(circuit.components.count>=48)
                            Button("Calculate circuit") {
                                do {
                                    dcRun=try NativeWorldLabDc.solve(circuit,project:project)
                                    problem=""
                                }catch {
                                    dcRun=nil;problem=error.localizedDescription
                                }
                            }
                        }.buttonStyle(.bordered)
                        TextField("Invented component name",text:$deviceName)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Invented electrical component name")
                        TextField("Unverified behavior assumption",text:$deviceAssumption)
                            .textFieldStyle(.roundedBorder)
                        TextField("Optional equivalent resistance Ω",text:$deviceResistance)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.decimalPad)
                        Button("Add hypothetical component"){
                            do {
                                let ohms:Double?
                                if deviceResistance.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                                    ohms=nil
                                }else {
                                    guard let parsed=Double(deviceResistance) else {
                                        throw NativeWorldLabError.invalid("Assumed resistance must be numerical")
                                    }
                                    ohms=parsed
                                }
                                applyProject{try NativeWorldLabEditor.inventOhmicDevice(
                                    $0,name:deviceName,assumption:deviceAssumption,
                                    assumedResistanceOhm:ohms)}
                                deviceName="";deviceAssumption="";deviceResistance=""
                            }catch{problem=error.localizedDescription}
                        }.buttonStyle(.bordered)
                            .disabled(deviceName.isEmpty || deviceAssumption.isEmpty ||
                                circuit.components.count>=48)
                        Text("Unverified inventions require explicit assumed electrical behavior.")
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(circuit.components.filter{$0.kind=="hypothetical-device"},id:\.id){part in
                            Text(part.name ?? "Unknown component")
                                .font(.caption)
                            Text(part.assumedResistanceOhm.map{
                                "Equivalent resistance assumed: "+String($0)+" Ω"
                            } ?? "No supported electrical law")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Text("Connect more parts and wire junctions").font(.headline)
                        HStack {
                            TextField("New junction name",text:$junctionName)
                                .textFieldStyle(.roundedBorder)
                            Button("Add junction"){
                                applyProject{try NativeWorldLabEditor.addCircuitNode(
                                    $0,label:junctionName)}
                                junctionName=""
                            }.disabled(junctionName.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ||
                                circuit.nodes.count>=24)
                        }.buttonStyle(.bordered)
                        ForEach(circuit.nodes,id:\.id){node in
                            HStack {
                                Text(node.label).font(.caption)
                                Spacer()
                                Button("Remove unused"){
                                    applyProject{try NativeWorldLabEditor.removeUnusedCircuitNode(
                                        $0,id:node.id)}
                                }.disabled(node.id==circuit.groundNodeId ||
                                    circuit.nodes.count<=2 ||
                                    circuit.components.contains(where:{
                                        $0.positiveNodeId==node.id || $0.negativeNodeId==node.id
                                    }))
                            }.buttonStyle(.bordered)
                        }
                        HStack {
                            Picker("From node",selection:$positiveWire){
                                ForEach(circuit.nodes,id:\.id){node in
                                    Text(node.label).tag(node.id)
                                }
                            }.pickerStyle(.menu)
                            Picker("To node",selection:$negativeWire){
                                ForEach(circuit.nodes,id:\.id){node in
                                    Text(node.label).tag(node.id)
                                }
                            }.pickerStyle(.menu)
                        }
                        Button("Connect 200 Ω resistor"){
                            applyProject{try NativeWorldLabEditor.addCircuitResistor(
                                $0,positive:positiveWire,negative:negativeWire)}
                        }.buttonStyle(.bordered)
                            .disabled(positiveWire==negativeWire ||
                                circuit.components.count>=48 ||
                                !circuit.nodes.contains(where:{$0.id==positiveWire}) ||
                                !circuit.nodes.contains(where:{$0.id==negativeWire}))
                        Text("Edit existing component terminals").font(.subheadline)
                        ForEach(circuit.components,id:\.id){part in
                            Text(part.kind=="hypothetical-device"
                                ? part.name ?? "Unknown invention" : part.kind)
                                .font(.caption)
                            HStack {
                                Picker("Positive terminal",
                                    selection:Binding<String>(
                                        get:{part.positiveNodeId},
                                        set:{value in
                                            applyProject{try NativeWorldLabEditor.rewireCircuitPart(
                                                $0,id:part.id,positive:value,
                                                negative:part.negativeNodeId)}
                                        })){
                                    ForEach(circuit.nodes,id:\.id){node in
                                        Text(node.label).tag(node.id)
                                    }
                                }.pickerStyle(.menu)
                                Picker("Negative terminal",
                                    selection:Binding<String>(
                                        get:{part.negativeNodeId},
                                        set:{value in
                                            applyProject{try NativeWorldLabEditor.rewireCircuitPart(
                                                $0,id:part.id,positive:part.positiveNodeId,
                                                negative:value)}
                                        })){
                                    ForEach(circuit.nodes,id:\.id){node in
                                        Text(node.label).tag(node.id)
                                    }
                                }.pickerStyle(.menu)
                            }
                        }
                        Text("Only real shared circuit node IDs create connections; no measured wiring geometry is claimed.")
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(circuit.components.filter{$0.kind=="dc-source"||$0.kind=="resistor"},
                            id:\.id){part in
                            HStack {
                                let isSource=part.kind=="dc-source"
                                let value=part.voltageV ?? part.resistanceOhm ?? 0
                                Text(String(format:"%.2f",value)+(isSource ? " V" : " Ω"))
                                Button("−"){
                                    applyProject{try NativeWorldLabEditor.adjustCircuitComponent(
                                        $0,id:part.id,delta:isSource ? -1 : -10)}
                                }
                                Button("+"){
                                    applyProject{try NativeWorldLabEditor.adjustCircuitComponent(
                                        $0,id:part.id,delta:isSource ? 1 : 10)}
                                }
                                if !isSource {
                                    Button("Remove"){
                                        applyProject{try NativeWorldLabEditor.removeCircuitComponent($0,id:part.id)}
                                    }
                                }
                            }.buttonStyle(.bordered)
                        }
                        if let run=dcRun,run.projectId==project.id,
                           run.projectRevision==project.revision,run.networkId==circuit.id {
                            value("Power delivered",run.deliveredPowerW,"W")
                            value("Resistor heating",run.resistorHeatW,"W")
                            value("Power residual",run.powerResidualW,"W")
                            ForEach(run.branchCurrentsA.keys.sorted(),id:\.self){id in
                                value(id+" current",run.branchCurrentsA[id],"A")
                            }
                            Text(run.validity).font(.caption).foregroundStyle(.secondary)
                        }
                    
    }
    @ViewBuilder private func solidContent(project:NativeWorldLabProject,
        solid:NativeLabSolid)->some View {
        solidPlacementContent(project:project,solid:solid)
        solidGroupSphereContent(project:project)
        solidGravityContent(project:project)
        solidOpticsContent(project:project)
        solidOpticalSceneContent(project:project)
        solidHeatTransferContent(project:project)
        scientificEvidenceLibrary(project:project)
        solidSphereImpactContent(project:project,solid:solid)
        solidCollisionContent(project:project,solid:solid)
        solidBeamContent(project:project,solid:solid)
        Text("Material: "+(material?.name ?? "Unknown")+" (hypothetical)")
                                value("Assumed mass",assumedMass,"kg")
        solidFluidContent(project:project,solid:solid)
        solidHydroContent(project:project,solid:solid)
        if let derived=assumedMass,derived>=0.001,derived<=10000 {
            solidEnergyControlsContent(project:project,solid:solid,derived:derived)
            solidMotorReadoutContent(project:project,solid:solid)
            solidDropReadoutContent(project:project,solid:solid)
        }
    }

    private func updateHeatTransferScene(){
        guard let run=heatTransferRun,
              let snapshot=try? run.sample(heatTransferTime) else{return}
        let materials:[(String,Double)]=[
            (run.firstEntityId,snapshot.firstTemperatureK),
            (run.secondEntityId,snapshot.secondTemperatureK)]
        for (id,kelvin) in materials {
            guard let node=scene.rootNode.childNode(withName:"lab-solid-"+id,
                recursively:false),
                  let material=node.geometry?.firstMaterial else{continue}
            let fraction=CGFloat(max(0,min(1,(kelvin-200)/1800)))
            material.diffuse.contents=UIColor(
                red:0.2+0.75*fraction,green:0.4+0.35*fraction,
                blue:0.85-0.65*fraction,alpha:1)
        }
    }
    @ViewBuilder private func solidHeatTransferContent(
        project:NativeWorldLabProject)->some View {
        let boxes=project.entities.filter{$0.shape=="box"}
        Text("Transfer heat between invented materials").font(.headline)
        Text("Two face-touching boxes exchange thermal energy according to " + "their assumed density, specific heat and conductivity. Native " + "calculations only; no actual material identity or safety claim.")
            .font(.caption).foregroundStyle(.secondary)
        if boxes.count<2 {
            Text("Create two box solids and invent their thermal properties.")
                .font(.caption)
        }else {
            let first=boxes.first(where:{$0.id==heatFirstId}) ?? boxes[0]
            let second=boxes.first(where:{$0.id==heatSecondId && $0.id != first.id}) ?? boxes.first(where:{$0.id != first.id})!
            HStack {
                Picker("First material body",selection:Binding(
                    get:{first.id},set:{heatFirstId=$0;heatTransferRun=nil})){
                    ForEach(boxes,id:\.id){body in
                        Text(body.name).tag(body.id)
                    }
                }
                Picker("Second material body",selection:Binding(
                    get:{second.id},set:{heatSecondId=$0;heatTransferRun=nil})){
                    ForEach(boxes.filter{$0.id != first.id},id:\.id){body in
                        Text(body.name).tag(body.id)
                    }
                }
            }.pickerStyle(.menu)
            HStack {
                TextField("First K",text:$heatFirstTemperature)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("First material temperature Kelvin")
                TextField("Second K",text:$heatSecondTemperature)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Second material temperature Kelvin")
                TextField("Seconds",text:$heatDuration)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Thermal simulation duration")
            }
            Button("Calculate local material heat transfer"){
                do {
                    guard let t1=Double(heatFirstTemperature),
                          let t2=Double(heatSecondTemperature),
                          let duration=Double(heatDuration) else {
                        throw NativeWorldLabError.invalid(
                            "Enter numerical temperatures and simulated duration")
                    }
                    let solved=try NativeWorldLabHeatTransfer.evaluate(
                        project,firstId:first.id,secondId:second.id,
                        firstTemperatureK:t1,secondTemperatureK:t2,
                        durationSeconds:duration)
                    heatTransferRun=solved;heatTransferTime=0;heatTransferPlaying=false
                    problem="";redraw();updateHeatTransferScene()
                }catch{
                    heatTransferRun=nil;heatTransferPlaying=false
                    problem=error.localizedDescription
                }
            }.buttonStyle(.bordered)
        }
        if let run=heatTransferRun,run.projectId==project.id,
           run.projectRevision==project.revision,
           let sample=try? run.sample(heatTransferTime) {
            value("First invented material temperature",
                sample.firstTemperatureK,"K")
            value("Second invented material temperature",
                sample.secondTemperatureK,"K")
            value("Contact heat flow",sample.interfaceHeatFlowW,"W")
            value("Thermal energy residual",sample.energyResidualJ,"J")
            Slider(value:$heatTransferTime,in:0...run.durationSeconds,
                onEditingChanged:{editing in
                    if editing {heatTransferPlaying=false}
                    updateHeatTransferScene()
                })
                .accessibilityLabel("Material heat exchange timeline")
                .onChange(of:heatTransferTime){_ in updateHeatTransferScene()}
            HStack {
                Button(heatTransferPlaying ? "Pause heat":"Play heat"){
                    heatTransferPlaying.toggle()
                }
                Button("Reset heat"){
                    heatTransferPlaying=false;heatTransferTime=0
                    updateHeatTransferScene()
                }
                Button("Export heat evidence"){exportingHeatTransfer=true}
                Button("Keep on device"){retainMaterialHeatEvidence()}
            }.buttonStyle(.bordered)
            Picker("Thermal playback speed",selection:$heatTransferSpeed){
                ForEach([0.1,1.0,5.0,10.0],id:\.self){rate in
                    Text(String(format:"%.1f×",rate)).tag(rate)
                }
            }.pickerStyle(.segmented)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private func solidOpticsContent(
        project:NativeWorldLabProject)->some View {
        let materials=project.materials
        Text("Invented light and material behavior").font(.headline)
        Text("Local planar Fresnel reflection and Snell refraction from invented, " + "explicitly assumed indices. No measured optical material or " + "spectral properties are implied.")
            .font(.caption).foregroundStyle(.secondary)
        if materials.count>=2 {
            let first=materials.first(where:{$0.id==opticalFirstId}) ?? materials[0]
            let second=materials.first(where:{$0.id==opticalSecondId && $0.id != first.id}) ?? materials.first(where:{$0.id != first.id})!
            Picker("Light begins in",selection:Binding(
                get:{first.id},set:{opticalFirstId=$0;opticalRun=nil})){
                ForEach(materials,id:\.id){m in
                    Text(m.name+" (n="+(m.refractiveIndex.map{String($0)} ?? "?")+")").tag(m.id)
                }
            }.pickerStyle(.menu)
            Picker("Light enters",selection:Binding(
                get:{second.id},set:{opticalSecondId=$0;opticalRun=nil})){
                ForEach(materials.filter{$0.id != first.id},id:\.id){m in
                    Text(m.name+" (n="+(m.refractiveIndex.map{String($0)} ?? "?")+")").tag(m.id)
                }
            }.pickerStyle(.menu)
            TextField("Incidence angle 0–89.9 degrees",text:$opticalAngle)
                .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
            Button("Calculate ideal light interface on device"){
                do {
                    guard let angle=Double(opticalAngle) else {
                        throw NativeWorldLabError.invalid("Enter a finite incidence angle.")
                    }
                    opticalRun=try NativeWorldLabOptics.calculate(
                        project,firstId:first.id,secondId:second.id,angleDegrees:angle)
                    problem=""
                }catch{opticalRun=nil;problem=error.localizedDescription}
            }.buttonStyle(.bordered)
            if let run=opticalRun,run.projectId==project.id && run.projectRevision==project.revision,
                run.firstMaterialId==first.id,run.secondMaterialId==second.id {
                value("Ideal reflection",run.reflectance*100,"%")
                value("Ideal transmission",run.transmittance*100,"%")
                if run.totalInternalReflection {
                    Text("Total internal reflection (no transmitted ray).")
                }else{value("Transmitted angle",run.transmittedDegrees,"degrees")}
                Button("Keep optical evidence with invention"){
                    do{
                        _ = try savedScience.saveOptics(run,project:project)
                        refreshScientificEvidence()
                        problem="Saved portable optical evidence with this device's invention."
                    }catch{problem=error.localizedDescription}
                }.buttonStyle(.bordered)
                Text(run.validity).font(.caption).foregroundStyle(.secondary)
            }
        }else{
            Text("Invent at least two materials and add their assumed refractive indices.")
                .font(.caption)
        }
    }
    private func rayVector(_ string:String)throws->[Double]{
        let values=string.split(separator:",",omittingEmptySubsequences:false).map{
            Double($0.trimmingCharacters(in:.whitespacesAndNewlines))
        }
        guard values.count==3,values.allSatisfy({$0?.isFinite == true}) else{
            throw NativeWorldLabError.invalid(
                "Ray origin and direction need exactly three finite X,Y,Z values.")
        }
        return values.compactMap{$0}
    }
    @ViewBuilder private func solidOpticalSceneContent(
        project:NativeWorldLabProject)->some View{
        let optical=project.entities.filter{item in
            item.scientificRole=="reference-solid" && ["box","sphere"].contains(item.shape) && project.materials.contains(where:{
                $0.id==item.materialId && $0.refractiveIndex != nil
            })
        }
        Text("Trace light through invented 3D solids").font(.headline)
        Text("Native geometry-derived primary-ray optics. The actual invented " + "box and sphere positions determine the intersections. " + "Additional reflected branches, absorption and diffraction " + "are not simulated.")
            .font(.caption).foregroundStyle(.secondary)
        Text("Optically configured solids: "+String(optical.count)).font(.caption)
        if let target=optical.first {
            Button("Aim at "+target.name){
                let x=target.positionMeters[0],y=target.positionMeters[1]
                let z=target.positionMeters[2]
                let base=max(2,target.dimensionsMeters[0])
                opticalRayOrigin=[x-2*base,y,z].map{String($0)}.joined(separator:",")
                opticalRayDirection="1,0,0"
                opticalRayDistance=String(min(1000,base*5))
                opticalRayRun=nil;redraw()
            }.buttonStyle(.bordered)
        }
        TextField("Light origin X,Y,Z metres",text:$opticalRayOrigin)
            .textFieldStyle(.roundedBorder)
            .onChange(of:opticalRayOrigin){_ in opticalRayRun=nil;redraw()}
        TextField("Ray travel direction X,Y,Z",text:$opticalRayDirection)
            .textFieldStyle(.roundedBorder)
            .onChange(of:opticalRayDirection){_ in opticalRayRun=nil;redraw()}
        HStack{
            TextField("Distance in metres",text:$opticalRayDistance)
                .textFieldStyle(.roundedBorder)
                .onChange(of:opticalRayDistance){_ in opticalRayRun=nil;redraw()}
            TextField("Maximum boundaries",text:$opticalRayContacts)
                .textFieldStyle(.roundedBorder)
                .onChange(of:opticalRayContacts){_ in opticalRayRun=nil;redraw()}
        }
        Button("Trace invented 3D ray locally"){
            do{
                guard let distance=Double(opticalRayDistance),
                    let limit=Int(opticalRayContacts) else{
                    throw NativeWorldLabError.invalid(
                        "Enter a finite distance and integer boundary limit.")
                }
                let input=NativeOpticalSceneInput(
                    originMeters:try rayVector(opticalRayOrigin),
                    direction:try rayVector(opticalRayDirection),
                    maximumDistanceMeters:distance,maximumInterfaces:limit)
                opticalRayRun=try NativeWorldLabOpticalScene.trace(project,input:input)
                problem="Computed geometry-aware optical intersections locally."
                redraw()
            }catch{opticalRayRun=nil;problem=error.localizedDescription;redraw()}
        }.buttonStyle(.bordered)
            .disabled(optical.isEmpty)
        if let run=opticalRayRun,run.projectId==project.id,
            run.projectRevision==project.revision {
            value("Remaining primary light",run.finalPrimaryRayPowerFraction*100,"%")
            value("Untraced reflected light",
                  run.accountedLostBranchPowerFraction*100,"%")
            Text("Computed path segments: "+String(run.segments.count))
                .font(.caption)
            ForEach(run.segments.indices,id:\.self){i in
                let step=run.segments[i]
                Text("\(i+1). "+step.kind+" · "+String(
                    format:"%.3f m",step.travelMeters))
                    .font(.caption)
            }
            Button("Keep invented 3D ray evidence with project"){
                do {
                    _ = try savedScience.saveOpticalScene(run,project:project)
                    refreshScientificEvidence()
                    problem="Saved portable 3D ray evidence with this invention."
                }catch{problem=error.localizedDescription}
            }.buttonStyle(.bordered)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }
    private func updateGravityScene(){
        guard let run=gravityRun,let frame=try? run.sample(gravityTime) else{return}
        for (index,body) in run.bodies.enumerated() {
            guard frame.positionsM.indices.contains(index),
                  let node=scene.rootNode.childNode(
                      withName:"lab-solid-"+body.entityId,recursively:false) else{continue}
            let pos=frame.positionsM[index]
            node.position=SCNVector3(Float(pos[0]),Float(pos[1]),Float(pos[2]))
        }
    }
    @ViewBuilder private func solidGravityContent(
        project:NativeWorldLabProject)->some View {
        let spheres=project.entities.filter{$0.shape=="sphere"}
        let defaults=Set(spheres.prefix(2).map{$0.id})
        let selected=gravitySelectionTouched ? gravitySelectedIds : defaults
        Text("Explore invented gravity").font(.headline)
        Text("Genuine local Newtonian attraction, computed from each sphere's " + "invented density and starting velocity. Nothing is uploaded " + "and no measured planet or impact is inferred.")
            .font(.caption).foregroundStyle(.secondary)
        if spheres.count<2 {
            Text("Create at least two spheres with invented material density.")
                .font(.caption)
        }else{
            ScrollView(.vertical){
                VStack(alignment:.leading,spacing:8){
                    ForEach(spheres,id:\.id){sphere in
                        Toggle(sphere.name,isOn:Binding(
                            get:{selected.contains(sphere.id)},
                            set:{enabled in
                                gravitySelectionTouched=true
                                var next=selected
                                if enabled {next.insert(sphere.id)}
                                else {next.remove(sphere.id)}
                                gravitySelectedIds=next
                                gravityRun=nil;gravityPlaying=false
                            }))
                        if selected.contains(sphere.id) {
                            TextField("X,Y,Z initial speed (m/s)",
                                text:Binding(
                                    get:{gravitySpeeds[sphere.id] ?? "0,0,0"},
                                    set:{value in
                                        gravitySpeeds[sphere.id]=value
                                        gravityRun=nil;gravityPlaying=false
                                    }))
                                .textFieldStyle(.roundedBorder)
                                .accessibilityLabel("Gravity starting velocity "+sphere.id)
                        }
                    }
                }
            }.frame(maxHeight:230)
            HStack {
                TextField("Duration (seconds)",value:$gravityDuration,format:.number)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Gravity duration seconds")
                TextField("Integration steps",value:$gravitySteps,format:.number)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Gravity integration steps")
            }
            Button("Calculate local gravity"){
                do {
                    let ordered=spheres.filter{selected.contains($0.id)}
                    var velocityMap=[String:[Double]]()
                    for body in ordered {
                        velocityMap[body.id]=try nativeSphereVelocity(
                            gravitySpeeds[body.id] ?? "0,0,0")
                    }
                    let result=try NativeWorldLabGravity.evaluate(project,
                        ids:ordered.map{$0.id},velocities:velocityMap,
                        durationSeconds:gravityDuration,integrationSteps:gravitySteps)
                    gravityRun=result;gravityTime=0;gravityPlaying=false
                    groupRun=nil;groupPlaying=false
                    sphereRun=nil;spherePlaying=false
                    collisionRun=nil;collisionPlaying=false
                    problem="";redraw();updateGravityScene()
                }catch{
                    gravityRun=nil;gravityPlaying=false;problem=error.localizedDescription
                }
            }.buttonStyle(.bordered)
                .disabled(selected.count<2 || selected.count>8)
            if selected.count>8 {
                Text("The native solver supports up to 8 bodies offline. " + "Reduce the selection; no automatic cloud upload occurs.")
                    .font(.caption)
            }
        }
        if let run=gravityRun,run.projectId==project.id,
           run.projectRevision==project.revision {
            value("Numerical energy drift",run.energyDriftFraction*100,"%")
            Text("Simulated gravity time: " + String(format:"%.2f",gravityTime)+" seconds")
                .font(.caption)
            Slider(value:$gravityTime,in:0...run.durationSeconds,
                onEditingChanged:{editing in
                    if editing {gravityPlaying=false}
                    updateGravityScene()
                })
                .accessibilityLabel("Gravitational simulation timeline")
                .onChange(of:gravityTime){_ in updateGravityScene()}
            HStack {
                Button(gravityPlaying ? "Pause gravity":"Play gravity"){
                    gravityPlaying.toggle()
                }
                Button("Reset gravity"){
                    gravityPlaying=false;gravityTime=0;updateGravityScene()
                }
                Button("Export gravity evidence"){exportingGravityEvidence=true}
                Button("Keep on device"){retainGravityEvidence()}
            }.buttonStyle(.bordered)
            Picker("Gravity playback speed",selection:$gravityRate){
                ForEach([0.1,1.0,5.0,10.0],id:\.self){rate in
                    Text(String(format:"%.1f×",rate)).tag(rate)
                }
            }.pickerStyle(.segmented)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }
    private func updateGroupSphereScene() {
        guard let run=groupRun,let frame=try? run.sample(groupTime) else{return}
        for object in frame.objects {
            if let node=scene.rootNode.childNode(withName:"lab-solid-"+object.entityId,
                recursively:false) {
                node.position=SCNVector3(Float(object.positionM[0]),
                    Float(object.positionM[1]),Float(object.positionM[2]))
            }
        }
    }

    @ViewBuilder private func solidGroupSphereContent(
        project:NativeWorldLabProject)->some View {
        let spheres=project.entities.filter{$0.shape=="sphere"}
        Text("Collide a group of spheres").font(.headline)
        Text("An event-driven free-flight calculation: each sphere has an invented density and X/Y/Z velocity. Successive or independent simultaneous impacts transfer momentum. Shared-sphere contacts, spin, gravity and breakage are not modeled.")
            .font(.caption).foregroundStyle(.secondary)
        if spheres.count<2 || spheres.count>12 {
            Text("Create 2–12 spheres and assign an invented density to each.")
                .font(.caption)
        }else{
            ScrollView(.vertical) {
                VStack(alignment:.leading,spacing:6) {
                    ForEach(spheres.indices,id:\.self){i in
                        let item=spheres[i]
                        Text(item.name+" · "+String(item.id.prefix(8)))
                            .font(.subheadline)
                        TextField("X,Y,Z speed (m/s) for "+item.name,
                            text:Binding(
                                get:{groupSpeeds[item.id] ?? (i==0 ? "2,0,0":"0,0,0")},
                                set:{newValue in
                                    groupSpeeds[item.id]=newValue
                                    groupRun=nil;groupPlaying=false;redraw()
                                }
                            ))
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Sphere group velocity "+item.id)
                    }
                }
            }.frame(maxHeight:230)
            value("Invented group restitution",groupRestitution,"")
            Slider(value:$groupRestitution,in:0...1)
                .accessibilityLabel("Group sphere restitution")
                .onChange(of:groupRestitution){_ in
                    groupRun=nil;groupPlaying=false;redraw()
                }
            Button("Calculate all sphere contacts"){
                do {
                    var velocityMap=[String:[Double]]()
                    for (i,item) in spheres.enumerated(){
                        velocityMap[item.id]=try nativeSphereVelocity(
                            groupSpeeds[item.id] ?? (i==0 ? "2,0,0":"0,0,0"))
                    }
                    let result=try NativeWorldLabMultiSphere.evaluate(
                        project,velocities:velocityMap,restitution:groupRestitution)
                    groupRun=result;groupTime=0;groupPlaying=false
                    collisionRun=nil;collisionPlaying=false
                    sphereRun=nil;spherePlaying=false
                    problem="";redraw();updateGroupSphereScene()
                }catch{groupRun=nil;groupPlaying=false;problem=error.localizedDescription}
            }.buttonStyle(.bordered)
        }
        if let run=groupRun,run.projectId==project.id,
           run.projectRevision==project.revision {
            value("Calculated successive impacts",Double(run.events.count),"")
            value("Initial kinetic energy",run.totalInitialEnergyJ,"J")
            value("Remaining kinetic energy",run.totalFinalEnergyJ,"J")
            value("Dissipated kinetic energy",run.totalDissipatedEnergyJ,"J")
            Text("Momentum before (kg·m/s): "+run.initialMomentumKgMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Momentum after (kg·m/s): "+run.finalMomentumKgMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            ForEach(run.events.indices,id:\.self){i in
                let event=run.events[i]
                Text("Impact \(i+1) at "+String(format:"%.4f",event.atSeconds)+" s: "+event.firstEntityId+" → "+event.secondEntityId)
                    .font(.caption)
            }
            Text("Group simulated time: "+String(format:"%.2f",groupTime)+" s")
            Slider(value:$groupTime,in:0...run.durationSeconds,
                onEditingChanged:{editing in
                    if editing {groupPlaying=false}
                    updateGroupSphereScene()
                })
                .accessibilityLabel("Explore group collision time")
                .onChange(of:groupTime){_ in updateGroupSphereScene()}
            if let frame=try? run.sample(groupTime) {
                value("Contacts completed",Double(frame.completedEvents),"")
            }
            HStack(spacing:6) {
                Button("Beginning"){groupPlaying=false;groupTime=0;updateGroupSphereScene()}
                Button("Prev contact"){
                    groupPlaying=false
                    groupTime=NativeWorldLabTime.previousEvent(current:groupTime,
                        duration:run.durationSeconds,events:run.events.map{$0.atSeconds})
                    updateGroupSphereScene()
                }.disabled(!run.events.contains{$0.atSeconds<groupTime-1e-9})
                Button(groupPlaying ? "Pause":"Play"){groupPlaying.toggle()}
                    .buttonStyle(.borderedProminent)
                Button("Next contact"){
                    groupPlaying=false
                    groupTime=NativeWorldLabTime.nextEvent(current:groupTime,
                        duration:run.durationSeconds,events:run.events.map{$0.atSeconds})
                    updateGroupSphereScene()
                }
                Button("End"){groupPlaying=false;groupTime=run.durationSeconds;updateGroupSphereScene()}
            }.buttonStyle(.bordered)
            Picker("Group impact playback speed",selection:$groupPlaybackRate) {
                Text("0.01×").tag(0.01);Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0);Text("100×").tag(100.0)
            }.pickerStyle(.segmented)
            Button("Export group collision evidence"){exportingGroupEvidence=true}
                .buttonStyle(.bordered)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func nativeSphereVelocity(_ input:String)throws->[Double] {
        let values=input.split(separator:",",omittingEmptySubsequences:false).compactMap {
            Double($0.trimmingCharacters(in:.whitespacesAndNewlines))
        }
        guard values.count==3,values.allSatisfy({$0.isFinite}) else {
            throw NativeWorldLabError.invalid("Provide three numeric X,Y,Z velocities separated by commas")
        }
        return values
    }
    private func updateSphereScene(){
        guard let run=sphereRun,let sample=try? run.sample(sphereTime) else {return}
        if let first=scene.rootNode.childNode(withName:"lab-solid-"+run.firstEntityId,
            recursively:false) {
            first.position=SCNVector3(Float(sample.firstCentreM[0]),
                Float(sample.firstCentreM[1]),Float(sample.firstCentreM[2]))
        }
        if let second=scene.rootNode.childNode(withName:"lab-solid-"+run.secondEntityId,
            recursively:false) {
            second.position=SCNVector3(Float(sample.secondCentreM[0]),
                Float(sample.secondCentreM[1]),Float(sample.secondCentreM[2]))
        }
    }

    @ViewBuilder private func solidSphereImpactContent(
        project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
        let other=project.entities.first(where:{$0.id==sphereOtherId})
        Text("Collide invented spheres in 3D").font(.headline)
        Text("Real off-axis first contact for two smooth ideal spheres. User-assumed density and restitution; no gravity, rolling, breakage or other contacts.")
            .font(.caption).foregroundStyle(.secondary)
        Picker("Other sphere for 3D impact",selection:$sphereOtherId){
            Text("Choose another sphere").tag("")
            ForEach(project.entities.filter{$0.shape=="sphere"&&$0.id != solid.id},
                id:\.id){item in
                Text(item.name).tag(item.id)
            }
        }.pickerStyle(.menu)
            .onChange(of:sphereOtherId){_ in
                sphereRun=nil;spherePlaying=false;redraw()
            }
        TextField("First sphere velocity X,Y,Z in m/s",text:$sphereFirstVelocity)
            .textFieldStyle(.roundedBorder).keyboardType(.numbersAndPunctuation)
            .onChange(of:sphereFirstVelocity){_ in sphereRun=nil;spherePlaying=false;redraw()}
        TextField("Second sphere velocity X,Y,Z in m/s",text:$sphereSecondVelocity)
            .textFieldStyle(.roundedBorder).keyboardType(.numbersAndPunctuation)
            .onChange(of:sphereSecondVelocity){_ in sphereRun=nil;spherePlaying=false;redraw()}
        value("Assumed spatial restitution",sphereRestitution,"")
        Slider(value:$sphereRestitution,in:0...1)
            .accessibilityLabel("Three-dimensional restitution")
            .onChange(of:sphereRestitution){_ in sphereRun=nil;spherePlaying=false;redraw()}
        Button("Calculate three-dimensional sphere impact"){
            do {
                guard let other,other.id != solid.id else {
                    throw NativeWorldLabError.invalid("Select a different sphere")
                }
                let initialA=try nativeSphereVelocity(sphereFirstVelocity)
                let initialB=try nativeSphereVelocity(sphereSecondVelocity)
                let run=try NativeWorldLabSphereImpact.evaluate(project,
                    firstId:solid.id,secondId:other.id,
                    firstVelocityMps:initialA,secondVelocityMps:initialB,
                    restitution:sphereRestitution)
                sphereRun=run;sphereTime=0;spherePlaying=false
                collisionRun=nil;collisionPlaying=false;problem=""
                redraw();updateSphereScene()
            }catch {sphereRun=nil;spherePlaying=false;problem=error.localizedDescription}
        }.buttonStyle(.bordered)
            .disabled(solid.shape != "sphere"||other?.shape != "sphere"||other?.id==solid.id)
        if let run=sphereRun,run.projectId==project.id,
           run.projectRevision==project.revision,
           (run.firstEntityId==solid.id||run.secondEntityId==solid.id) {
            value("3D impact time",run.impactTimeSeconds,"s")
            value("First mass",run.firstMassKg,"kg")
            value("Second mass",run.secondMassKg,"kg")
            Text("Impulse X/Y/Z (N·s): "+run.impulseNs.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Final first velocity X/Y/Z (m/s): "+run.firstFinalVelocityMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Final second velocity X/Y/Z (m/s): "+run.secondFinalVelocityMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Momentum before X/Y/Z: "+run.momentumBeforeKgMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Momentum after X/Y/Z: "+run.momentumAfterKgMps.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Angular momentum before X/Y/Z: "+run.angularMomentumBeforeKgM2PerS.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            Text("Angular momentum after X/Y/Z: "+run.angularMomentumAfterKgM2PerS.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                .font(.caption)
            value("Energy before",run.energyBeforeJ,"J")
            value("Energy after",run.energyAfterJ,"J")
            value("Dissipated energy",run.dissipatedEnergyJ,"J")
            if let at=try? run.sample(sphereTime){
                Text("First centre X/Y/Z (m): "+at.firstCentreM.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                    .font(.caption)
                Text("Second centre X/Y/Z (m): "+at.secondCentreM.map{String(format:"%.4g",$0)}.joined(separator:" / "))
                    .font(.caption)
            }
            Text("3D impact time: "+String(format:"%.2f",sphereTime)+" s")
            Slider(value:$sphereTime,in:0...run.durationSeconds,
                onEditingChanged:{editing in
                    if editing {spherePlaying=false}
                }).accessibilityLabel("Explore three-dimensional impact time")
                .onChange(of:sphereTime){_ in updateSphereScene()}
            HStack(spacing:6){
                Button("Beginning"){spherePlaying=false;sphereTime=0;updateSphereScene()}
                Button("Prev contact"){
                    spherePlaying=false
                    sphereTime=NativeWorldLabTime.previousEvent(current:sphereTime,
                        duration:run.durationSeconds,events:[run.impactTimeSeconds])
                    updateSphereScene()
                }.disabled(sphereTime<=1e-9)
                Button(spherePlaying ? "Pause":"Play"){spherePlaying.toggle()}
                    .buttonStyle(.borderedProminent)
                Button("Next contact"){
                    spherePlaying=false
                    sphereTime=NativeWorldLabTime.nextEvent(current:sphereTime,
                        duration:run.durationSeconds,events:[run.impactTimeSeconds])
                    updateSphereScene()
                }
                Button("End"){spherePlaying=false;sphereTime=run.durationSeconds;updateSphereScene()}
            }.buttonStyle(.bordered)
            Picker("3D collision playback rate",selection:$sphereSpeed){
                Text("0.01×").tag(0.01);Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0);Text("100×").tag(100.0)
            }.pickerStyle(.segmented)
            Button("Export 3D impact evidence"){
                exportingSphereImpact=true
            }.buttonStyle(.bordered)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func updateCollisionScene() {
        guard let run=collisionRun,
              let state=try? run.sample(collisionTime) else {return}
        if let left=scene.rootNode.childNode(withName:"lab-solid-"+run.leftEntityId,
            recursively:false) {
            left.position=SCNVector3(Float(state.leftCenterXM),left.position.y,left.position.z)
        }
        if let right=scene.rootNode.childNode(withName:"lab-solid-"+run.rightEntityId,
            recursively:false) {
            right.position=SCNVector3(Float(state.rightCenterXM),right.position.y,right.position.z)
        }
    }

    @ViewBuilder private func solidCollisionContent(
        project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
        let other=project.entities.first(where:{$0.id==collisionOtherId})
        Text("Collide two invented solids").font(.headline)
        Text("Single 1D central impact along X between shapes with aligned Y/Z centres. Hypothetical densities give masses; no spin, fracture or other 3D contacts.")
            .font(.caption).foregroundStyle(.secondary)
        Picker("Other solid to collide with",selection:$collisionOtherId){
            Text("Choose another solid").tag("")
            ForEach(project.entities.filter{$0.id != solid.id},id:\.id){item in
                Text(item.name).tag(item.id)
            }
        }.pickerStyle(.menu)
            .onChange(of:collisionOtherId){_ in
                collisionRun=nil;collisionPlaying=false;redraw()
            }
        TextField("Left object speed m/s",text:$collisionLeftSpeed)
            .keyboardType(.numbersAndPunctuation).textFieldStyle(.roundedBorder)
            .onChange(of:collisionLeftSpeed){_ in
                collisionRun=nil;collisionPlaying=false;redraw()
            }
        TextField("Right object speed m/s",text:$collisionRightSpeed)
            .keyboardType(.numbersAndPunctuation).textFieldStyle(.roundedBorder)
            .onChange(of:collisionRightSpeed){_ in
                collisionRun=nil;collisionPlaying=false;redraw()
            }
        value("Assumed impact restitution",collisionRestitution,"")
        Slider(value:$collisionRestitution,in:0...1)
            .accessibilityLabel("Collision restitution")
            .onChange(of:collisionRestitution){_ in
                collisionRun=nil;collisionPlaying=false;redraw()
            }
        Button("Calculate two-body collision"){
            do {
                guard let other,other.id != solid.id,
                      let left=Double(collisionLeftSpeed),
                      let right=Double(collisionRightSpeed) else {
                    throw NativeWorldLabError.invalid("Choose two solids and finite starting speeds")
                }
                let run=try NativeWorldLabCollision.evaluate(project,
                    firstId:solid.id,secondId:other.id,
                    velocityLeftMps:left,velocityRightMps:right,
                    restitution:collisionRestitution)
                collisionRun=run;collisionTime=0;collisionPlaying=false
                problem="";redraw();updateCollisionScene()
            }catch{collisionRun=nil;collisionPlaying=false;problem=error.localizedDescription}
        }.buttonStyle(.bordered).disabled(other==nil||other?.id==solid.id)
        if let run=collisionRun,run.projectId==project.id,
           run.projectRevision==project.revision,
           (run.leftEntityId==solid.id||run.rightEntityId==solid.id){
            value("Left assumed mass",run.leftMassKg,"kg")
            value("Right assumed mass",run.rightMassKg,"kg")
            value("Impact time",run.impactTimeSeconds,"s")
            value("Impulse",run.impulseNs,"N·s")
            value("Left velocity after impact",run.leftFinalVelocityMps,"m/s")
            value("Right velocity after impact",run.rightFinalVelocityMps,"m/s")
            value("Momentum before",run.momentumBeforeKgMps,"kg·m/s")
            value("Momentum after",run.momentumAfterKgMps,"kg·m/s")
            value("Kinetic energy before",run.energyBeforeJ,"J")
            value("Kinetic energy after",run.energyAfterJ,"J")
            value("Dissipated energy",run.dissipatedEnergyJ,"J")
            if let state=try? run.sample(collisionTime){
                value("Left X position",state.leftCenterXM,"m")
                value("Right X position",state.rightCenterXM,"m")
            }
            Text("Collision time: "+String(format:"%.2f",collisionTime)+" s")
            Slider(value:$collisionTime,in:0...run.durationSeconds,
                onEditingChanged:{editing in
                    if editing {collisionPlaying=false}
                    updateCollisionScene()
                }).accessibilityLabel("Explore collision time")
                .onChange(of:collisionTime){_ in updateCollisionScene()}
            HStack(spacing:6){
                Button("Beginning"){collisionPlaying=false;collisionTime=0;updateCollisionScene()}
                Button("Prev contact"){
                    collisionPlaying=false
                    collisionTime=NativeWorldLabTime.previousEvent(current:collisionTime,
                        duration:run.durationSeconds,events:[run.impactTimeSeconds])
                    updateCollisionScene()
                }.disabled(collisionTime<=1e-9)
                Button(collisionPlaying ? "Pause":"Play"){collisionPlaying.toggle()}
                    .buttonStyle(.borderedProminent)
                Button("Next contact"){
                    collisionPlaying=false
                    collisionTime=NativeWorldLabTime.nextEvent(current:collisionTime,
                        duration:run.durationSeconds,events:[run.impactTimeSeconds])
                    updateCollisionScene()
                }
                Button("End"){collisionPlaying=false;collisionTime=run.durationSeconds;updateCollisionScene()}
            }.buttonStyle(.bordered)
            Picker("Collision playback speed",selection:$collisionSpeed){
                Text("0.01×").tag(0.01);Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0);Text("100×").tag(100.0)
            }.pickerStyle(.segmented)
            Button("Export collision evidence"){exportingCollision=true}
                .buttonStyle(.bordered)
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func solidBeamContent(
        project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
        let chosen=project.materials.first(where:{$0.id==solid.materialId})
        Text("Test hypothetical elastic beam bending").font(.headline)
        Text("Assume a rectangular cantilever: X length, Y vertical depth, Z width, fixed at one end, with a static downward force at the free end.")
            .font(.caption).foregroundStyle(.secondary)
        value("Assumed Young's modulus",chosen?.youngModulusPa,"Pa")
        TextField("Downward beam tip load in newtons",text:$beamForce)
            .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
        Button("Calculate elastic bending"){
            do {
                guard let load=Double(beamForce) else {
                    throw NativeWorldLabError.invalid("Tip load must be a finite number")
                }
                beamRun=try NativeWorldLabStructural.bending(project,
                    entityId:solid.id,forceN:load)
                problem=""
            }catch {beamRun=nil;problem=error.localizedDescription}
        }.buttonStyle(.bordered)
            .disabled(solid.shape != "box" || (chosen?.youngModulusPa ?? 0)<=0)
        if let run=beamRun,run.projectId==project.id,
           run.projectRevision==project.revision,run.entityId==solid.id,
           run.forceN==Double(beamForce) {
            value("Free-end deflection",run.tipDeflectionM,"m")
            value("Maximum bending stress",run.maximumStressPa,"Pa")
            value("Maximum surface strain",run.surfaceStrain,"")
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func geodeticSummary(solid:NativeLabSolid,origin:NativeGeodetic)->String? {
        let local=NativeEnu(eastMeters:solid.positionMeters[0],
            northMeters:solid.positionMeters[2],upMeters:solid.positionMeters[1])
        guard let ecef=try? NativeWorldLabGeodesy.fromEnu(local,origin:origin),
              let point=try? NativeWorldLabGeodesy.fromEcef(ecef) else{return nil}
        return String(format:"WGS84: %.7f° / %.7f° / %.2f m",
            point.latitudeDegrees,point.longitudeDegrees,point.heightMeters)
    }
    @ViewBuilder private func solidPlacementContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                        HStack {
                            Button("Previous"){selected=max(0,selected-1)}.disabled(selected==0)
                            Spacer()
                            Text(String(selected+1)+" / "+String(project.entities.count))
                            Spacer()
                            Button("Next"){selected=min(project.entities.count-1,selected+1)}
                                .disabled(selected==project.entities.count-1)
                        }
                        Text("Selected: "+solid.name+" ("+solid.shape+")")
                        if let origin=project.world.geodeticOrigin,
                           let summary=geodeticSummary(solid:solid,origin:origin) {
                            Text(summary).font(.caption).foregroundStyle(.secondary)
                        }
                        value("Ideal volume",solid.volumeMetersCubed,"m³")
                        HStack {
                            Button("Smaller"){
                                let scaled=solid.dimensionsMeters.map{max(0.001,$0*0.9)}
                                applyProject{try NativeWorldLabEditor.resizeSolid(
                                    $0,id:solid.id,dimensionsMeters:scaled)}
                            }
                            Button("Larger"){
                                let scaled=solid.dimensionsMeters.map{min(10000,$0*1.1)}
                                applyProject{try NativeWorldLabEditor.resizeSolid(
                                    $0,id:solid.id,dimensionsMeters:scaled)}
                            }
                        }.buttonStyle(.bordered)
                        Text("Rotate and transform").font(.headline)
                        HStack{
                            Button("X +15°"){applyProject{try NativeWorldLabEditor.rotateSolid($0,id:solid.id,axis:0,deltaDegrees:15)}}
                            Button("Y +15°"){applyProject{try NativeWorldLabEditor.rotateSolid($0,id:solid.id,axis:1,deltaDegrees:15)}}
                            Button("Z +15°"){applyProject{try NativeWorldLabEditor.rotateSolid($0,id:solid.id,axis:2,deltaDegrees:15)}}
                        }.buttonStyle(.bordered)
                        HStack{
                            Button("Scale 1.1×"){applyProject{try NativeWorldLabEditor.scaleSolid($0,id:solid.id,factors:[1.1,1.1,1.1])}}
                            Button("Duplicate +X"){applyProject{try NativeWorldLabEditor.duplicateSolid($0,id:solid.id,offsetMeters:[gridSpacing,0,0])}}
                            Button("Linear pattern"){applyProject{try NativeWorldLabEditor.linearPattern($0,id:solid.id,axis:0,spacingMeters:gridSpacing,copies:2)}}
                            Button("Mirror X"){applyProject{try NativeWorldLabEditor.mirrorSolid($0,id:solid.id,axis:0,planeMeters:0)}}
                            Button("Circular pattern"){applyProject{try NativeWorldLabEditor.circularPattern($0,id:solid.id,axis:2,centerMeters:[0,0,0],instances:4)}}
                        }.buttonStyle(.bordered)
                        Text("Rotation: "+solid.effectiveRotationRadians.map{String(format:"%.3f",$0)}.joined(separator:" / ")+" rad")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("2D sketch and extrusion").font(.headline)
                        Text("Draw a closed rectangle or circle in the X/Z plane and extrude along Y.")
                            .font(.caption).foregroundStyle(.secondary)
                        HStack{
                            TextField("Width m",text:$cadSketchWidth).keyboardType(.decimalPad)
                            TextField("Depth m",text:$cadSketchDepth).keyboardType(.decimalPad)
                        }.textFieldStyle(.roundedBorder)
                        HStack{
                            TextField("Height m",text:$cadSketchHeight).keyboardType(.decimalPad)
                            TextField("Circle radius m",text:$cadSketchRadius).keyboardType(.decimalPad)
                        }.textFieldStyle(.roundedBorder)
                        Text("Sketch centre on base plane (X/Y/Z metres)").font(.caption)
                        HStack{
                            TextField("X m",text:$cadSketchX).keyboardType(.decimalPad)
                            TextField("Y m",text:$cadSketchY).keyboardType(.decimalPad)
                            TextField("Z m",text:$cadSketchZ).keyboardType(.decimalPad)
                        }.textFieldStyle(.roundedBorder)
                        Text("Extrusion orientation (X/Y/Z degrees)").font(.caption)
                        HStack{
                            TextField("X °",text:$cadSketchRotationX).keyboardType(.decimalPad)
                            TextField("Y °",text:$cadSketchRotationY).keyboardType(.decimalPad)
                            TextField("Z °",text:$cadSketchRotationZ).keyboardType(.decimalPad)
                        }.textFieldStyle(.roundedBorder)
                        HStack{
                            Button("Extrude rectangle"){
                                do{
                                    guard let width=Double(cadSketchWidth),let depth=Double(cadSketchDepth),
                                          let height=Double(cadSketchHeight) else {
                                        throw NativeWorldLabError.invalid("Enter valid sketch dimensions")
                                    }
                                    let base=[cadSketchX,cadSketchY,cadSketchZ].compactMap{Double($0)}
                                    let rotation=[cadSketchRotationX,cadSketchRotationY,cadSketchRotationZ]
                                        .compactMap{Double($0)}.map{$0*Double.pi/180}
                                    guard base.count==3,rotation.count==3 else {
                                        throw NativeWorldLabError.invalid("Enter three valid position and rotation values")
                                    }
                                    applyProject{try NativeWorldLabEditor.extrudeRectangle($0,
                                        widthMeters:width,depthMeters:depth,heightMeters:height,
                                        centerMeters:base,rotationRadians:rotation)}
                                }catch{problem=error.localizedDescription}
                            }.disabled(project.entities.count>=200)
                            Button("Extrude circle"){
                                do{
                                    guard let radius=Double(cadSketchRadius),let height=Double(cadSketchHeight) else {
                                        throw NativeWorldLabError.invalid("Enter a valid circular sketch")
                                    }
                                    let base=[cadSketchX,cadSketchY,cadSketchZ].compactMap{Double($0)}
                                    let rotation=[cadSketchRotationX,cadSketchRotationY,cadSketchRotationZ]
                                        .compactMap{Double($0)}.map{$0*Double.pi/180}
                                    guard base.count==3,rotation.count==3 else {
                                        throw NativeWorldLabError.invalid("Enter three valid position and rotation values")
                                    }
                                    applyProject{try NativeWorldLabEditor.extrudeCircle($0,
                                        radiusMeters:radius,heightMeters:height,
                                        centerMeters:base,rotationRadians:rotation)}
                                }catch{problem=error.localizedDescription}
                            }.disabled(project.entities.count>=200)
                        }.buttonStyle(.bordered)
                        Text("Position and measure").font(.headline)
                        HStack {
                            Picker("Grid spacing",selection:$gridSpacing) {
                                Text("0.1 m").tag(0.1)
                                Text("0.5 m").tag(0.5)
                                Text("1 m").tag(1.0)
                                Text("5 m").tag(5.0)
                            }.pickerStyle(.menu).accessibilityLabel("Grid snap spacing")
                            Button("Snap center"){
                                applyProject{try NativeWorldLabEditor.snapSolid(
                                    $0,id:solid.id,gridMeters:gridSpacing)}
                            }.buttonStyle(.bordered)
                        }
                        let others=project.entities.filter{$0.id != solid.id}
                        if !others.isEmpty {
                            Picker("Measure to",selection:$measureTargetId){
                                Text("Choose another solid").tag("")
                                ForEach(others,id:\.id){candidate in
                                    Text(candidate.name).tag(candidate.id)
                                }
                            }.pickerStyle(.menu)
                                .accessibilityLabel("Measure distance to solid")
                            if let other=others.first(where:{$0.id==measureTargetId}),
                               let measurement=try? NativeWorldLabEditor.measureCenters(
                                  project,fromId:solid.id,toId:other.id) {
                                value("Center distance",measurement.centerDistanceM,"m")
                                value("Horizontal distance",measurement.horizontalDistanceM,"m")
                                value("X offset",measurement.offsetXM,"m")
                                value("Y offset",measurement.offsetYM,"m")
                                value("Z offset",measurement.offsetZM,"m")
                                if let clearance=try? NativeWorldLabSpatial.inspect(solid,other) {
                                    value("Bounding-box clearance lower bound",
                                        clearance.gapLowerBoundMeters,"m")
                                    Text("Bounds: "+clearance.status.replacingOccurrences(
                                        of:"-",with:" "))
                                    if clearance.status=="box-intersection" {
                                        let overlapText=clearance.overlapDepthMeters
                                            .map { String(format:"%.4f",$0) }
                                            .joined(separator:" / ")
                                        Text("Box overlap X/Y/Z: \(overlapText) m")
                                    }
                                    Text(clearance.validity)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }

    }

    @ViewBuilder private func solidFluidContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                        Text("Try floating your invention").font(.headline)
                        value("Liquid surface height",fluidSurfaceHeight,"m")
                        Slider(value:$fluidSurfaceHeight,in:0...5) { editing in
                            if editing {fluidPlaying=false;fluidMotion=nil}
                        }.accessibilityLabel("Liquid surface above ground")
                        value("Assumed fluid drag",fluidDrag,"N·s/m")
                        Slider(value:$fluidDrag,in:0...1000) { editing in
                            if editing {fluidPlaying=false;fluidMotion=nil}
                        }.accessibilityLabel("Assumed viscous damping")
                        Button("Simulate floating or sinking"){
                            do {
                                let startingHeight=max(0,
                                    solid.positionMeters[1]-solid.dimensionsMeters[1]/2)
                                let input=NativeLabFluidMotionInput(
                                    fluidDensityKgM3:fluidDensity,
                                    waterSurfaceHeightM:fluidSurfaceHeight,
                                    startingBottomHeightM:startingHeight,
                                    linearDragNsPerM:fluidDrag)
                                fluidMotion=try NativeWorldLabFluidMotion.evaluate(
                                    project,entityId:solid.id,input:input)
                                fluidTime=0;fluidPlaying=true;problem=""
                                scene.rootNode.childNode(withName:"world-lab-fluid-plane",
                                    recursively:false)?.removeFromParentNode()
                                let plane=SCNPlane(width:12,height:12)
                                plane.firstMaterial?.diffuse.contents=UIColor.systemBlue
                                plane.firstMaterial?.transparency=0.25
                                plane.firstMaterial?.isDoubleSided=true
                                let water=SCNNode(geometry:plane)
                                water.name="world-lab-fluid-plane"
                                water.eulerAngles.x = -Float.pi/2
                                water.position.y=Float(fluidSurfaceHeight)
                                scene.rootNode.addChildNode(water)
                                applyFluidPosition()
                            }catch{
                                fluidPlaying=false;fluidMotion=nil
                                problem=error.localizedDescription
                            }
                        }.buttonStyle(.bordered)
                        if let run=fluidMotion,run.projectId==project.id,
                           run.projectRevision==project.revision,run.entityId==solid.id,
                           !run.samples.isEmpty {
                            let index=max(0,min(run.samples.count-1,
                                Int((fluidTime/run.stepSeconds).rounded())))
                            let observation=run.samples[index]
                            value("Simulated fluid time",observation.timeSeconds,"s")
                            value("Bottom height",observation.bottomHeightM,"m")
                            value("Vertical velocity",observation.velocityMps,"m/s")
                            value("Submerged depth",observation.immersionDepthM,"m")
                            value("Calculated buoyancy",observation.buoyancyForceN,"N")
                            value("Energy residual",observation.energyResidualJ,"J")
                            Slider(value:$fluidTime,
                                in:0...(run.samples.last?.timeSeconds ?? 4)) { editing in
                                if editing {fluidPlaying=false}
                            }.accessibilityLabel("Explore fluid motion time")
                            HStack {
                                Button(fluidPlaying ? "Pause fluid":"Play fluid"){
                                    fluidPlaying.toggle()
                                }
                                Button("Reset fluid"){fluidPlaying=false;fluidTime=0}
                                Button("Step fluid"){
                                    fluidPlaying=false
                                    fluidTime=min(run.samples.last?.timeSeconds ?? 4,
                                        fluidTime+run.stepSeconds)
                                }
                            }.buttonStyle(.bordered)
                            Text(run.validity).font(.caption).foregroundStyle(.secondary)
                            Text("Blue 3D plane is an assumed flat fluid surface, not measured water.")
                                .font(.caption).foregroundStyle(.secondary)
                        }

    }

    @ViewBuilder private func solidHydroContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                        value("Assumed fluid density",fluidDensity,"kg/m³")
                        Slider(value:$fluidDensity,in:100...2500) { editing in
                            if editing {hydroRun=nil}
                        }.accessibilityLabel("Fluid density")
                        Text("Immersion depth: \(Int(fluidFraction*100))% of height")
                            .font(.caption)
                        Slider(value:$fluidFraction,in:0...1) { editing in
                            if editing {hydroRun=nil}
                        }.accessibilityLabel("Fraction of solid submerged")
                        Button("Calculate buoyancy"){
                            do {
                                hydroRun=try NativeWorldLabHydrostatics.evaluate(
                                    project,entityId:solid.id,fluidDensityKgM3:fluidDensity,
                                    immersionDepthM:solid.dimensionsMeters[1]*fluidFraction)
                                problem=""
                            }catch {hydroRun=nil;problem=error.localizedDescription}
                        }.buttonStyle(.bordered)
                        if let liquid=hydroRun,liquid.projectId==project.id,
                           liquid.projectRevision==project.revision,liquid.entityId==solid.id {
                            value("Displaced fluid",liquid.displacedVolumeM3,"m³")
                            value("Upward buoyancy",liquid.buoyancyForceN,"N")
                            value("Bottom gauge pressure",liquid.bottomGaugePressurePa,"Pa")
                            Text("Floating status: "+liquid.status)
                            value("Net upward force",liquid.netUpwardForceN,"N")
                            value("Equilibrium draft",liquid.equilibriumDraftM,"m")
                            Text(liquid.validity).font(.caption).foregroundStyle(.secondary)
                        }

    }

    @ViewBuilder private func solidEnergyControlsContent(project:NativeWorldLabProject,solid:NativeLabSolid,derived:Double)->some View {
                            Button("Test assumed mass in spring model"){
                                mass=derived;mode=0;seconds=0;playing=false
                            }.buttonStyle(.borderedProminent)
                            Button("Drop this solid"){
                                do {
                                    let d=solid.dimensionsMeters
                                    let area=solid.shape=="box" ? d[0]*d[2] : Double.pi*d[0]*d[2]/4
                                    var input=NativeDropInput(massKg:derived,
                                        supportingHalfHeightM:d[1]/2,projectedAreaM2:area)
                                    input.dragCoefficient=solid.shape=="sphere" ? 0.47 : 1.05
                                    dropRun=try NativeWorldLabDropScience.evaluate(input)
                                    dropEntityId=solid.id;dropTime=0;dropPlaying=true;playing=false
                                    problem="";applyDropPosition()
                                }catch{problem=error.localizedDescription}
                            }.buttonStyle(.bordered)
                            Button(motorThermalEnabled ? "Coil heating: on" : "Coil heating: off"){
                                motorThermalEnabled.toggle()
                                motorRun=nil;motorAudit=nil;motorPlaying=false
                            }.buttonStyle(.bordered)
                            Button("Power this solid"){
                                do {
                                    var input=NativeActuatorInput(massKg:derived)
                                    if motorThermalEnabled {input.thermal=NativeActuatorThermalInput()}
                                    let result=try NativeWorldLabActuator.evaluate(input)
                                    motorAudit=try NativeWorldLabActuator.numericalAudit(input,result)
                                    motorRun=result;wiredMotor=nil;digitalMotor=nil
                                    motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                    dropPlaying=false;playing=false;problem=""
                                    applyMotorPosition()
                                }catch{problem=error.localizedDescription}
                            }.buttonStyle(.bordered)
                            if let circuit=project.networks?.first {
                                Button("Wire motor to circuit"){
                                    do {
                                        let linked=try NativeWorldLabNetworkMotor.evaluate(
                                            project,network:circuit,entityId:solid.id,
                                            massKg:derived,thermal:motorThermalEnabled)
                                        guard let supply=circuit.components.first(where:{$0.kind=="dc-source"})?.voltageV else {
                                            throw NativeWorldLabError.invalid("Circuit source voltage is missing")
                                        }
                                        var input=NativeActuatorInput(massKg:derived)
                                        input.supplyVoltageV=supply
                                        if motorThermalEnabled {
                                            input.thermal=NativeActuatorThermalInput()
                                        }
                                        motorAudit=try NativeWorldLabActuator.numericalAudit(
                                            input,linked.motor)
                                        wiredMotor=linked;digitalMotor=nil;motorRun=linked.motor
                                        motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                        dropPlaying=false;playing=false;problem=""
                                        applyMotorPosition()
                                    }catch{problem=error.localizedDescription}
                                }.buttonStyle(.bordered)
                            }

                            if let logic=project.digitalNetworks?.first {
                                ForEach(logic.outputs,id:\.id){output in
                                    Button("Drive with invented logic: "+output.label){
                                        do {
                                            let linked=try NativeWorldLabDigitalMotor.evaluate(
                                                project,networkId:logic.id,outputId:output.id,
                                                entityId:solid.id,massKg:derived,
                                                thermal:motorThermalEnabled)
                                            let verified=try NativeWorldLabActuator.numericalAudit(
                                                linked.input,linked.motor)
                                            digitalMotor=linked;wiredMotor=nil
                                            motorRun=linked.motor;motorAudit=verified
                                            motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                            dropPlaying=false;playing=false;problem=""
                                            applyMotorPosition()
                                        }catch {digitalMotor=nil;problem=error.localizedDescription}
                                    }.buttonStyle(.bordered)
                                }
                            }


    }

    @ViewBuilder private func solidMotorReadoutContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                            if let run=motorRun,motorEntityId==solid.id {
                                let index=max(0,min(run.samples.count-1,
                                    Int((motorTime/run.stepSeconds).rounded())))
                                let sample=run.samples[index]
                                if let linked=digitalMotor,
                                    linked.projectId==project.id,
                                    linked.projectRevision==project.revision,
                                    linked.entityId==solid.id {
                                    Text("Invented digital output: "+String(linked.logicBit))
                                    value("Applied ideal voltage",linked.input.supplyVoltageV,"V")
                                    Text(linked.validity).font(.caption).foregroundStyle(.secondary)
                                }
                                value("Computed powered height",sample.heightM,"m")
                                value("Coil current",sample.currentA,"A")
                                value("Upward force",sample.motorForceN,"N")
                                value("Back-EMF",sample.backEmfV,"V")
                                value("Resistance heating",sample.resistiveHeatW,"W")
                                if let temperature=sample.coilTemperatureK,
                                    let r=sample.coilResistanceOhm {
                                    value("Coil temperature",temperature,"K")
                                    value("Hot coil resistance",r,"Ω")
                                    value("Stored coil heat",sample.thermalEnergyJ,"J")
                                    value("Cooling loss",sample.coolingPowerW,"W")
                                }
                                value("Energy balance residual",sample.energyResidualJ,"J")
                                if let wired=wiredMotor,wired.projectId==project.id,
                                   wired.projectRevision==project.revision,wired.entityId==solid.id {
                                    let observation=wired.samples[index]
                                    value("Total source current",observation.totalSourceCurrentA,"A")
                                    value("Parallel resistor heat",observation.passiveResistorHeatW,"W")
                                    value("Combined energy residual",observation.combinedEnergyResidualJ,"J")
                                    Text(wired.validity).font(.caption).foregroundStyle(.secondary)
                                }
                                if let audit=motorAudit {
                                    Text("Numerical self-check: \(audit.status). \(audit.explanation)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Slider(value:$motorTime,in:0...(run.samples.last?.timeSeconds ?? 4))
                                    .accessibilityLabel("Motor simulated time")
                                HStack {
                                    Button(motorPlaying ? "Pause motor":"Play motor"){motorPlaying.toggle()}
                                    Button("Reset motor"){motorPlaying=false;motorTime=0}
                                }.buttonStyle(.bordered)
                                Text("Electricity and physical motion are coupled in one 1D solver. Material and actuator parameters are hypothetical, not measurements.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }

    }

    @ViewBuilder private func solidDropReadoutContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                            if let run=dropRun,dropEntityId==solid.id {
                                let index=max(0,min(run.samples.count-1,Int((dropTime/run.stepSeconds).rounded())))
                                let sample=run.samples[index]
                                value("Computed drop height",sample.heightAboveGroundM,"m")
                                value("Computed vertical speed",abs(sample.velocityMps),"m/s")
                                Text("Estimated surface impacts: \(run.impactCount)").font(.caption)
                                Slider(value:$dropTime,in:0...(run.samples.last?.timeSeconds ?? 6))
                                    .accessibilityLabel("Drop simulated time")
                                HStack {
                                    Button(dropPlaying ? "Pause drop":"Play drop"){dropPlaying.toggle()}
                                    Button("Reset drop"){dropPlaying=false;dropTime=0}
                                }.buttonStyle(.bordered)
                                Text("Gravity, drag and contact are simplified. Invented material density is an assumption, not verified strength.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }

    }

    private func applyMotorPosition(){
        guard let run=motorRun,let id=motorEntityId,
              let solid=project?.entities.first(where:{$0.id==id}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+id,recursively:false),
              !run.samples.isEmpty else{return}
        let index=max(0,min(run.samples.count-1,Int((motorTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2+run.samples[index].heightM)
    }
    private func applyFluidPosition() {
        guard let run=fluidMotion,
              let solid=project?.entities.first(where:{$0.id==run.entityId}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+run.entityId,
                recursively:false),!run.samples.isEmpty else {return}
        let index=max(0,min(run.samples.count-1,
            Int((fluidTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2 + run.samples[index].bottomHeightM)
    }
    private func applyDropPosition() {
        guard let run=dropRun,let id=dropEntityId,
              let solid=project?.entities.first(where:{$0.id==id}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+id,recursively:false),
              !run.samples.isEmpty else{return}
        let index=max(0,min(run.samples.count-1,Int((dropTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2+run.samples[index].heightAboveGroundM)
    }
    private func currentObserverTarget()->[Double]{
        var target=project?.camera.lookingAtMeters ?? [0,1.2,0]
        target[0]+=observerPanX
        target[2]+=observerPanZ
        target[1]=max(-20000,min(100000,target[1]+observerVerticalOffset))
        return target
    }
    private func currentObserverRangeMeters()->Double{
        let target=currentObserverTarget(),position=sceneCameraNode.position
        return max(0.25,hypot(hypot(Double(position.x)-target[0],
            Double(position.y)-target[1]),Double(position.z)-target[2]))
    }
    private func orbitObserverView(yawDelta:Double,pitchDelta:Double){
        guard yawDelta.isFinite,pitchDelta.isFinite else{return}
        let target=currentObserverTarget(),position=sceneCameraNode.position
        let dx=Double(position.x)-target[0],dy=Double(position.y)-target[1],dz=Double(position.z)-target[2]
        let radius=max(0.25,hypot(hypot(dx,dy),dz))
        let yaw=atan2(dx,dz)+yawDelta
        let pitch=max(-1.3962634016,min(1.3962634016,
            asin(max(-1,min(1,dy/radius)))+pitchDelta))
        let horizontal=radius*cos(pitch)
        sceneCameraNode.position=SCNVector3(
            Float(target[0]+sin(yaw)*horizontal),
            Float(target[1]+sin(pitch)*radius),
            Float(target[2]+cos(yaw)*horizontal))
        sceneCameraNode.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        updateObserverCameraClip()
    }
    private func observerPanStepMeters()->Double{
        max(0.5,min(100,currentObserverRangeMeters()*0.1))
    }
    private func panObserverView(horizontal:Double,depth:Double){
        guard horizontal.isFinite,depth.isFinite else{return}
        let position=sceneCameraNode.position
        let yaw=atan2(Double(position.x)-currentObserverTarget()[0],
            Double(position.z)-currentObserverTarget()[2])
        let dx=horizontal*cos(yaw)+depth*sin(yaw)
        let dz=depth*cos(yaw)-horizontal*sin(yaw)
        observerPanX+=dx;observerPanZ+=dz
        sceneCameraNode.position=SCNVector3(
            position.x+Float(dx),position.y,position.z+Float(dz))
        let target=currentObserverTarget()
        sceneCameraNode.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        updateObserverCameraClip()
    }
    private func updateObserverCameraClip(){
        let target=currentObserverTarget(),position=sceneCameraNode.position
        let distance=max(0.25,hypot(hypot(Double(position.x)-target[0],Double(position.y)-target[1]),Double(position.z)-target[2]))
        sceneCameraNode.camera?.zNear=max(0.005,min(0.25,distance*0.0001))
        sceneCameraNode.camera?.zFar=max(1000,min(50_000_000,distance*128))
    }
    private func applyObserverVerticalOffset(){
        let target=currentObserverTarget()
        let delta=observerVerticalOffset-appliedObserverVerticalOffset
        let position=sceneCameraNode.position
        sceneCameraNode.position=SCNVector3(position.x,position.y+Float(delta),position.z)
        appliedObserverVerticalOffset=observerVerticalOffset
        sceneCameraNode.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        updateObserverCameraClip()
    }
    private func zoomToSelected(){
        guard let project,project.entities.indices.contains(selected) else{return}
        let target=project.entities[selected].positionMeters
        let position=sceneCameraNode.position
        let dx=Double(position.x)-target[0],dy=Double(position.y)-target[1],dz=Double(position.z)-target[2]
        let old=max(0.25,hypot(hypot(dx,dy),dz))
        let next=max(0.5,min(100000,old*0.35))
        let ratio=next/old
        sceneCameraNode.position=SCNVector3(
            Float(target[0]+dx*ratio),Float(target[1]+dy*ratio),Float(target[2]+dz*ratio))
        sceneCameraNode.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        updateObserverCameraClip()
    }
    private func zoomObserverView(factor:Double){
        guard factor.isFinite,factor>0 else{return}
        let target=currentObserverTarget(),position=sceneCameraNode.position
        let dx=Double(position.x)-target[0],dy=Double(position.y)-target[1],dz=Double(position.z)-target[2]
        let old=max(0.25,hypot(hypot(dx,dy),dz))
        let next=max(0.25,min(100000,old*factor))
        let ratio=next/old
        sceneCameraNode.position=SCNVector3(Float(target[0]+dx*ratio),Float(target[1]+dy*ratio),Float(target[2]+dz*ratio))
        sceneCameraNode.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        updateObserverCameraClip()
    }
    private func saveObserverViewpoint(){
        guard let current=project,let data=projectData else{return}
        do{
            let position=sceneCameraNode.position
            let target=currentObserverTarget()
            let next=try NativeWorldLabEditor.saveCameraViewpoint(data,
                positionMeters:[Double(position.x),Double(position.y),Double(position.z)],
                lookingAtMeters:target)
            projectData=next;project=try NativeWorldLabProject.decode(next)
            observerVerticalOffset=0;observerPanX=0;observerPanZ=0;appliedObserverVerticalOffset=0
            savedSnapshot=nil;problem="Observer viewpoint saved with this invention."
            redraw()
        }catch{problem=error.localizedDescription}
    }
    private func restoreObserverViewpoint(){
        guard let current=project else{return}
        observerVerticalOffset=0;observerPanX=0;observerPanZ=0;appliedObserverVerticalOffset=0
        sceneCameraNode.position=SCNVector3(
            Float(current.camera.positionMeters[0]),
            Float(current.camera.positionMeters[1]),
            Float(current.camera.positionMeters[2]))
        sceneCameraNode.look(at:SCNVector3(Float(current.camera.lookingAtMeters[0]),
            Float(current.camera.lookingAtMeters[1]),Float(current.camera.lookingAtMeters[2])))
        updateObserverCameraClip()
    }
    private func returnObserverToSurface(){
        observerVerticalOffset=0;observerPanX=0;observerPanZ=0;appliedObserverVerticalOffset=0
        sceneCameraNode.position=SCNVector3(0,1.65,-8)
        sceneCameraNode.look(at:SCNVector3(0,1.2,0))
        updateObserverCameraClip()
    }
    private func redraw(){
        let next=SCNScene()
        let floor=SCNNode(geometry:SCNFloor())
        floor.geometry?.firstMaterial?.diffuse.contents=UIColor.systemGreen
        next.rootNode.addChildNode(floor)
        let savedCamera=SCNNode()
        savedCamera.name="world-lab-observer-camera"
        savedCamera.camera=SCNCamera()
        let position=project?.camera.positionMeters ?? [0,1.65,-8]
        let target=project?.camera.lookingAtMeters ?? [0,1.2,0]
        savedCamera.position=SCNVector3(Float(position[0]),Float(position[1]),Float(position[2]))
        savedCamera.camera?.zNear=0.03
        savedCamera.camera?.zFar=5_000_000
        savedCamera.look(at:SCNVector3(Float(target[0]),Float(target[1]),Float(target[2])))
        next.rootNode.addChildNode(savedCamera)
        sceneCameraNode=savedCamera
        if let project {
            let selectedId=project.entities.indices.contains(selected) ? project.entities[selected].id : nil
            let targets=NativeWorldLabInspectionGeometry.targetIds(project:project,selectedId:selectedId)
            let settings=NativeWorldLabInspectionSettings(mode:inspectionMode,opacity:inspectionOpacity,
                axis:inspectionAxis,cutawayFraction:inspectionCutawayFraction,
                explosionDistanceMeters:inspectionExplodeDistance)
            let offset=NativeWorldLabInspectionGeometry.planeOffset(project:project,selectedId:selectedId,settings:settings)
            for item in project.entities.prefix(200) {
                if !NativeWorldLabInspectionGeometry.isVisible(project:project,selectedId:selectedId,mode:inspectionMode,id:item.id){continue}
                let xyz=item.dimensionsMeters
                let cut=inspectionMode == .cutaway && targets.contains(item.id) && offset != nil
                let geometry:SCNGeometry
                if cut,let offset {
                    geometry=NativeWorldLabInspectionGeometry.makeCutawayGeometry(item,axis:inspectionAxis.index,offset:offset)
                }else{
                    switch item.shape {
                    case "sphere":geometry=SCNSphere(radius:CGFloat(xyz[0]/2))
                    case "cylinder":geometry=SCNCylinder(radius:CGFloat(xyz[0]/2),height:CGFloat(xyz[1]))
                    default:geometry=SCNBox(width:CGFloat(xyz[0]),height:CGFloat(xyz[1]),length:CGFloat(xyz[2]),chamferRadius:0)
                    }
                }
                let node=SCNNode(geometry:geometry)
                node.name="lab-solid-"+item.id
                if cut {node.position=SCNVector3Zero}
                else {
                    let p=NativeWorldLabInspectionGeometry.renderPosition(project:project,selectedId:selectedId,settings:settings,id:item.id)
                    node.position=SCNVector3(Float(p[0]),Float(p[1]),Float(p[2]))
                    let rotation=item.effectiveRotationRadians
                    if rotation.count==3 {node.eulerAngles=SCNVector3(Float(rotation[0]),Float(rotation[1]),Float(rotation[2]))}
                }
                if let hex=UInt64(item.color.dropFirst(),radix:16){
                    geometry.firstMaterial?.diffuse.contents=UIColor(
                        red:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:1)
                }
                let inspectionTarget=targets.contains(item.id)
                let transparentTarget=inspectionTarget &&
                    (inspectionMode == .transparent || inspectionMode == .cutaway || seeInside)
                let xrayTarget=inspectionTarget && inspectionMode == .xray
                geometry.firstMaterial?.transparency=CGFloat(transparentTarget ? inspectionOpacity : 1)*CGFloat(item.opacity)
                geometry.firstMaterial?.fillMode=xrayTarget ? .lines : .fill
                geometry.firstMaterial?.isDoubleSided=xrayTarget || cut
                next.rootNode.addChildNode(node)
            }
        }
        if mode==0 {
            let orb=SCNNode(geometry:SCNSphere(radius:0.4))
            orb.geometry?.firstMaterial?.diffuse.contents=UIColor.systemOrange
            orb.position=SCNVector3(Float((values?.xMeters ?? 0)*1.5),1.2,0)
            next.rootNode.addChildNode(orb)
        }else if mode==1 {
            let box=SCNNode(geometry:SCNBox(width:1.2,height:1,length:0.5,chamferRadius:0))
            box.position=SCNVector3(0,1,0)
            box.geometry?.firstMaterial?.diffuse.contents=UIColor.cyan
            next.rootNode.addChildNode(box)
        }else if let field=values?.temperatureK{
            for (i,kelvin) in field.enumerated(){
                let cell=SCNNode(geometry:SCNBox(width:0.115,height:0.36,
                                                 length:0.5,chamferRadius:0))
                let t=max(0,min(1,(kelvin-293.15)/80))
                cell.geometry?.firstMaterial?.diffuse.contents=UIColor(
                    red:0.2+0.8*t,green:0.3+0.55*t,blue:0.55,alpha:1)
                cell.position=SCNVector3(Float((Double(i)-10)*0.116),1.05,0)
                next.rootNode.addChildNode(cell)
            }
        }
        if let run=opticalRayRun,let project,
           run.projectId==project.id,run.projectRevision==project.revision {
            for (index,part) in run.segments.enumerated(){
                if part.kind=="limit" {continue}
                let start=part.startMeters,end=part.endMeters
                guard start.count==3,end.count==3,
                      zip(start,end).contains(where:{abs($0.0-$0.1)>1e-6})
                else {continue}
                let points=[
                    SCNVector3(Float(start[0]),Float(start[1]),Float(start[2])),
                    SCNVector3(Float(end[0]),Float(end[1]),Float(end[2]))
                ]
                let source=SCNGeometrySource(vertices:points)
                let element=SCNGeometryElement(indices:[Int32(0),Int32(1)],
                    primitiveType:.line)
                let geometry=SCNGeometry(sources:[source],elements:[element])
                let rayMaterial=SCNMaterial()
                rayMaterial.lightingModel = .constant
                rayMaterial.diffuse.contents =
                    part.kind=="total-internal-reflection" ?
                        UIColor.systemOrange:UIColor.systemCyan
                rayMaterial.isDoubleSided=true
                geometry.materials=[rayMaterial]
                let pathNode=SCNNode(geometry:geometry)
                pathNode.name="invented-optical-ray-"+String(index)
                next.rootNode.addChildNode(pathNode)
            }
        }
        scene=next
        observerVerticalOffset=0;observerPanX=0;observerPanZ=0;appliedObserverVerticalOffset=0
        updateObserverCameraClip()
        applyDropPosition()
        applyMotorPosition()
    }
}


// MARK: - Independent native iOS elastic wave experiment
private struct NativeWorldLabElasticWavePanel:View {
    let project:NativeWorldLabProject
    @State private var evidenceStatus=""
    @State private var rodIndex=0
    @State private var mode="1"
    @State private var amplitude="0.00001"
    @State private var cycles="4"
    @State private var run:NativeElasticWaveRun?
    @State private var fraction=0.0
    @State private var playing=false
    @State private var speed=1.0
    @State private var problem=""
    @State private var exporting=false
    @State private var evidenceFile:NativeWorldLabJsonFile?

    private var rods:[NativeLabSolid] {
        project.entities.filter{$0.shape=="box" || $0.shape=="cylinder"}
    }
    private var current:NativeElasticWaveRun? {
        guard let r=run,!rods.isEmpty,
              r.projectId==project.id && r.projectRevision==project.revision && r.entityId==rods[rodIndex%rods.count].id else {return nil}
        return r
    }
    var body:some View {
        VStack(alignment:.leading,spacing:8){
            Text("Make waves inside invented matter").font(.headline)
            Text("Analytic 1D standing waves from inventor-assumed density and stiffness. No measured material response, bending or fracture.")
                .font(.caption).foregroundStyle(.secondary)
            if !rods.isEmpty {
                Button("Rod: "+rods[rodIndex%rods.count].name){
                    rodIndex=(rodIndex+1)%rods.count
                    run=nil;playing=false
                }.buttonStyle(.bordered)
                HStack{
                    TextField("Mode 1–12",text:$mode).keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    TextField("Cycles 1–20",text:$cycles).keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                }
                TextField("Amplitude in metres",text:$amplitude)
                    .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                Button("Calculate local elastic wave"){
                    do{
                        guard let n=Int(mode),let c=Int(cycles),
                              let a=Double(amplitude) else {
                            throw NativeWorldLabError.invalid("Enter valid wave parameters")
                        }
                        run=try NativeWorldLabElasticWave.evaluate(project,
                            id:rods[rodIndex%rods.count].id,mode:n,
                            amplitudeMeters:a,cycles:c)
                        fraction=0;playing=false;problem=""
                    }catch{
                        run=nil;playing=false;problem=error.localizedDescription
                    }
                }.buttonStyle(.borderedProminent)
                if let r=current {
                    let sample=try? r.sample(r.durationSeconds*fraction)
                    Text("Wave speed: "+String(format:"%.5g",r.waveSpeedMps) + " m/s · frequency: "+String(format:"%.5g",r.frequencyHz)+" Hz")
                        .font(.caption)
                    Text("Maximum axial stress: "+String(format:"%.5g",r.maximumStressPa)+" Pa")
                        .font(.caption)
                    if let sample=sample {
                        GeometryReader{frame in
                            Path{path in
                                for (i,y) in sample.displacementsMeters.enumerated(){
                                    let x=frame.size.width*CGFloat(i) / CGFloat(sample.displacementsMeters.count-1)
                                    let v=frame.size.height*(0.5 - 0.35*y/r.amplitudeMeters)
                                    let point=CGPoint(x:x,y:v)
                                    if i==0 {path.move(to:point)}
                                    else {path.addLine(to:point)}
                                }
                            }.stroke(.primary,lineWidth:2)
                        }.frame(height:100)
                            .accessibilityLabel("Computed wave displacement along invented rod")
                        Slider(value:$fraction,in:0...1,onEditingChanged:{editing in
                            if editing{playing=false}
                        }).accessibilityLabel("Wave simulated time")
                        Text("Simulated time "+String(format:"%.5g",sample.timeSeconds)+" s")
                            .font(.caption)
                        HStack{
                            Button(playing ? "Pause wave":"Play wave"){playing.toggle()}
                            Button("Reset"){playing=false;fraction=0}
                            Button("Speed "+String(format:"%.1f",speed)+"×"){
                                speed=speed==1 ? 4 : speed==4 ? 0.1 : 1
                            }
                        }.buttonStyle(.bordered)
                        Text("Kinetic: "+String(format:"%.5g",sample.kineticEnergyJ) + " J · stored strain: "+String(format:"%.5g",sample.strainEnergyJ)+" J")
                            .font(.caption)
                        Text("Ideal total energy: "+String(format:"%.5g",sample.totalEnergyJ)+" J")
                            .font(.caption)
                    }
                    Button("Keep wave with saved invention"){
                        do {
                            _ = try NativeWorldLabScientificEvidenceStore()
                                .saveElasticWave(r,project:project)
                            evidenceStatus="Wave evidence saved to private invention history."
                            problem=""
                        }catch {
                            problem=error.localizedDescription
                            evidenceStatus=""
                        }
                    }.buttonStyle(.bordered)
                    Button("Export elastic-wave evidence"){
                        do{
                            let frames=try (0...80).map{
                                try r.sample(r.durationSeconds*Double($0)/80)
                            }
                            let source=try JSONEncoder().encode(r)
                            guard var payload=try JSONSerialization.jsonObject(
                                with:source) as? [String:Any] else {
                                throw NativeWorldLabError.invalid("Wave evidence is not JSON")
                            }
                            payload["frames"]=try JSONSerialization.jsonObject(
                                with:JSONEncoder().encode(frames))
                            let bytes=try JSONSerialization.data(withJSONObject:payload,
                                options:[.sortedKeys])
                            guard bytes.count<=1_048_576 else {
                                throw NativeWorldLabError.invalid("Wave evidence exceeds 1 MB")
                            }
                            evidenceFile=NativeWorldLabJsonFile(content:bytes)
                            exporting=true;problem=""
                        }catch{problem=error.localizedDescription}
                    }.buttonStyle(.bordered)
                    Text(r.validity).font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("Invent a box or cylinder and assume density and Young's modulus.")
                    .font(.caption)
            }
            if !evidenceStatus.isEmpty {
                Text(evidenceStatus).font(.caption).accessibilityAddTraits(.updatesFrequently)
            }
            if !problem.isEmpty{
                Text(problem).font(.caption).foregroundStyle(.red)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .task(id:playing){
            while playing && !Task.isCancelled {
                try? await Task.sleep(nanoseconds:40_000_000)
                guard let r=current else {playing=false;break}
                fraction=min(1,fraction+0.04*speed/(Double(r.cycles)*0.75))
                if fraction>=1{playing=false}
            }
        }
        .fileExporter(isPresented:$exporting,document:evidenceFile,
            contentType:.json,defaultFilename:"world-lab-elastic-wave"){result in
                if case .failure(let error)=result{problem=error.localizedDescription}
                evidenceFile=nil
            }
    }
}


// MARK: - Native inventor-driven radiative heat transfer
private struct NativeWorldLabRadiationPanel:View {
    let project:NativeWorldLabProject
    @State private var evidenceStatus=""
    @State private var selectedIndex=0
    @State private var initial="400"
    @State private var surrounding="300"
    @State private var emissivity="0.8"
    @State private var duration="1000"
    @State private var run:NativeRadiationRun?
    @State private var fraction=0.0
    @State private var playing=false
    @State private var speed=1.0
    @State private var problem=""
    @State private var exporting=false
    @State private var evidenceFile:NativeWorldLabJsonFile?
    private var current:NativeRadiationRun? {
        guard let run=run,!project.entities.isEmpty,
              run.projectId==project.id && run.projectRevision==project.revision && run.entityId==project.entities[selectedIndex%project.entities.count].id else {
            return nil
        }
        return run
    }
    var body:some View {
        VStack(alignment:.leading,spacing:8){
            Text("Radiate heat from invented matter").font(.headline)
            Text("Stefan–Boltzmann heating/cooling under hypothetical density, " + "specific heat, emissivity and environmental assumptions. " + "Not a measured atmosphere, sunlight or real material.")
                .font(.caption).foregroundStyle(.secondary)
            if !project.entities.isEmpty {
                Button("Radiating solid: " + project.entities[selectedIndex%project.entities.count].name){
                    selectedIndex=(selectedIndex+1)%project.entities.count
                    run=nil;playing=false
                }.buttonStyle(.bordered)
                HStack{
                    TextField("Initial K",text:$initial).keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                    TextField("Surroundings K",text:$surrounding)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                }
                HStack {
                    TextField("Emissivity 0–1",text:$emissivity)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Duration s",text:$duration)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                }
                Button("Calculate radiative heat locally"){
                    do{
                        guard let initialK=Double(initial),
                              let ambientK=Double(surrounding),
                              let e=Double(emissivity),let seconds=Double(duration) else {
                            throw NativeWorldLabError.invalid("Enter numeric radiation inputs")
                        }
                        run=try NativeWorldLabRadiation.evaluate(project,
                            id:project.entities[selectedIndex%project.entities.count].id,
                            startK:initialK,environmentK:ambientK,
                            emissivity:e,duration:seconds)
                        fraction=0;playing=false;problem=""
                    }catch{run=nil;playing=false;problem=error.localizedDescription}
                }.buttonStyle(.borderedProminent)
                if let r=current,let measured=try? r.sample(r.durationSeconds*fraction){
                    Text("Computed temperature " + String(format:"%.6g",measured.temperatureK)+" K · net heat " + String(format:"%.6g",measured.netRadiatedPowerW)+" W")
                        .font(.caption)
                    GeometryReader{frame in
                        Path{path in
                            let minimum=min(r.initialTemperatureK,r.environmentTemperatureK)
                            let maximum=max(r.initialTemperatureK,r.environmentTemperatureK)
                            let range=max(1,maximum-minimum)
                            for (i,s) in r.samples.enumerated(){
                                let x=frame.size.width*CGFloat(s.timeSeconds/r.durationSeconds)
                                let y=frame.size.height*CGFloat(0.9 - 0.8*(s.temperatureK-minimum)/range)
                                let point=CGPoint(x:x,y:y)
                                if i==0{path.move(to:point)}
                                else{path.addLine(to:point)}
                            }
                        }.stroke(.primary,lineWidth:2)
                    }.frame(height:100)
                        .accessibilityLabel("Computed radiative Kelvin temperature trace")
                    Slider(value:$fraction,in:0...1,onEditingChanged:{editing in
                        if editing{playing=false}
                    }).accessibilityLabel("Radiation simulated time")
                    Text("Simulated time " + String(format:"%.3f",measured.timeSeconds)+" s")
                        .font(.caption)
                    HStack{
                        Button(playing ? "Pause":"Play"){playing.toggle()}
                        Button("Reset"){playing=false;fraction=0}
                        Button("Speed "+String(format:"%.1f",speed)+"×"){
                            speed=speed==1 ? 4 : speed==4 ? 0.1 : 1
                        }
                    }.buttonStyle(.bordered)
                    Text("Net transferred energy " + String(format:"%.6g",measured.transferredEnergyJ) + " J · energy residual " + String(format:"%.5g",measured.energyResidualJ)+" J")
                        .font(.caption)
                    Button("Keep radiative result with saved invention"){
                        do {
                            _ = try NativeWorldLabScientificEvidenceStore()
                                .saveRadiation(r,project:project)
                            evidenceStatus="Radiative evidence saved to private invention history."
                            problem=""
                        }catch {
                            problem=error.localizedDescription
                            evidenceStatus=""
                        }
                    }.buttonStyle(.bordered)
                    Button("Export radiation evidence"){
                        do{
                            let bytes=try JSONEncoder().encode(r)
                            guard bytes.count<=1_048_576 else {
                                throw NativeWorldLabError.invalid("Radiation evidence exceeds 1 MB")
                            }
                            evidenceFile=NativeWorldLabJsonFile(content:bytes)
                            exporting=true;problem=""
                        }catch{problem=error.localizedDescription}
                    }.buttonStyle(.bordered)
                    Text(r.validity).font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("Invent a solid and thermal material before radiating.")
                    .font(.caption)
            }
            if !evidenceStatus.isEmpty {
                Text(evidenceStatus).font(.caption).accessibilityAddTraits(.updatesFrequently)
            }
            if !problem.isEmpty {
                Text(problem).font(.caption).foregroundStyle(.red)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .task(id:playing){
            while playing && !Task.isCancelled {
                try? await Task.sleep(nanoseconds:40_000_000)
                guard current != nil else {playing=false;break}
                fraction=min(1,fraction+0.04*speed/8)
                if fraction>=1{playing=false}
            }
        }
        .fileExporter(isPresented:$exporting,document:evidenceFile,
            contentType:.json,defaultFilename:"world-lab-radiative-heat"){result in
                if case .failure(let error)=result{problem=error.localizedDescription}
                evidenceFile=nil
            }
    }
}


private struct NativeWorldLabMultiCadPanel:View {
    let project:NativeWorldLabProject
    let source:Data
    let onEdit:(Data)->Void
    @State private var selected:Set<String>=[]
    @State private var axis=0
    @State private var alignment="min"
    @State private var degrees="15"
    @State private var factor="1.1"
    @State private var offset="1"
    @State private var gap="0.25"
    @State private var gridStep="0.5"
    @State private var plane="0"
    @State private var patternSpacing="2"
    @State private var copies="2"
    @State private var center="0,0,0"
    @State private var instances="4"
    @State private var error=""
    private var ids:[String]{
        project.entities.map{$0.id}.filter{selected.contains($0)}
    }
    private func apply(_ work:(Data)throws->Data){
        do{onEdit(try work(source));error=""}
        catch let caught{error=caught.localizedDescription}
    }
    private var selectedMeasurement:NativeWorldLabEditor.GeometryMeasurement? {
        guard ids.count==2 else{return nil}
        return try? NativeWorldLabEditor.measureCenters(project,fromId:ids[0],toId:ids[1])
    }
    @ViewBuilder private var snapAndMeasure:some View {
        VStack(alignment:.leading,spacing:6){
            HStack{
                TextField("Grid spacing m",text:$gridStep).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                Button("Snap selected"){
                    guard let step=Double(gridStep) else{
                        error="Enter a grid spacing from 0.001 to 100 metres";return
                    }
                    apply{try NativeWorldLabEditor.snapSolids($0,ids:ids,gridMeters:step)}
                }.disabled(ids.isEmpty)
            }.buttonStyle(.bordered)
            if let measurement=selectedMeasurement {
                VStack(alignment:.leading,spacing:3){
                    Text(String(format:"Centre distance: %.3f m",measurement.centerDistanceM))
                    Text(String(format:"Horizontal distance: %.3f m",measurement.horizontalDistanceM))
                    Text(String(format:"Offset X/Y/Z: %.3f / %.3f / %.3f m",
                        measurement.offsetXM,measurement.offsetYM,measurement.offsetZM))
                }.font(.caption)
            }else{
                Text("Select exactly two parts to measure their centre-to-centre distance.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    var body:some View{
        VStack(alignment:.leading,spacing:8){
            Text("Multi-part CAD").font(.headline)
            Text("Select several parts and transform them together. Each action is one atomic project revision. This changes geometry, not physical joints.")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(project.entities,id:\.id){solid in
                Toggle(isOn:Binding(
                    get:{selected.contains(solid.id)},
                    set:{value in
                        if value{selected.insert(solid.id)}
                        else{selected.remove(solid.id)}
                    }
                )){
                    Text(solid.name+" · "+solid.shape).font(.caption)
                }
            }
            Text("Selected: \(ids.count) / \(project.entities.count)").font(.caption)
            snapAndMeasure
            Picker("Axis",selection:$axis){
                Text("X").tag(0);Text("Y").tag(1);Text("Z").tag(2)
            }.pickerStyle(.segmented)
            HStack{
                TextField("Rotation °",text:$degrees).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                TextField("Uniform scale",text:$factor).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
            }
            HStack{
                Button("Rotate parts"){
                    guard let angle=Double(degrees) else{
                        error="Enter a valid rotation angle";return
                    }
                    apply{try NativeWorldLabEditor.rotateSolids($0,ids:ids,axis:axis,degrees:angle)}
                }.disabled(ids.isEmpty)
                Button("Rotate group"){
                    guard let angle=Double(degrees) else{
                        error="Enter a valid group rotation";return
                    }
                    apply{try NativeWorldLabEditor.rotateGroupAroundCentroid($0,ids:ids,axis:axis,degrees:angle)}
                }.disabled(ids.isEmpty)
                Button("Scale parts"){
                    guard let size=Double(factor) else{
                        error="Enter a valid scale factor";return
                    }
                    apply{try NativeWorldLabEditor.scaleSolids($0,ids:ids,
                        factors:[size,size,size])}
                }.disabled(ids.isEmpty)
                Button("Scale group"){
                    guard let size=Double(factor) else{
                        error="Enter a valid group scale";return
                    }
                    apply{try NativeWorldLabEditor.scaleGroupAroundCentroid($0,ids:ids,factor:size)}
                }.disabled(ids.isEmpty)
            }.buttonStyle(.bordered)
            HStack{
                TextField("Duplicate offset m",text:$offset).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                Button("Duplicate all"){
                    guard let distance=Double(offset) else{
                        error="Enter a valid duplicate offset";return
                    }
                    var vector=[0.0,0.0,0.0];vector[axis]=distance
                    apply{try NativeWorldLabEditor.duplicateSolids($0,ids:ids,
                        offsetMeters:vector)}
                }.disabled(ids.isEmpty||project.entities.count+ids.count>200)
            }
            HStack{
                Picker("Alignment",selection:$alignment){
                    Text("Minimum").tag("min")
                    Text("Center").tag("center")
                    Text("Maximum").tag("max")
                }.pickerStyle(.menu)
                Button("Align"){
                    apply{try NativeWorldLabEditor.alignSolids($0,ids:ids,
                        axis:axis,alignment:alignment)}
                }.disabled(ids.count<2)
            }.buttonStyle(.bordered)
            HStack{
                TextField("Distribution gap m",text:$gap).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                Button("Distribute"){
                    guard let distance=Double(gap) else{
                        error="Enter a valid distribution gap";return
                    }
                    apply{try NativeWorldLabEditor.distributeSolids($0,ids:ids,
                        axis:axis,gapMeters:distance)}
                }.disabled(ids.count<3)
            }
            HStack{
                TextField("Translate m",text:$offset).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                Button("Translate selection"){
                    guard let distance=Double(offset) else{error="Enter a valid translation";return}
                    var delta=[0.0,0.0,0.0];delta[axis]=distance
                    apply{try NativeWorldLabEditor.translateSolids($0,ids:ids,deltaMeters:delta)}
                }.disabled(ids.isEmpty)
            }
            HStack{
                TextField("Mirror plane m",text:$plane).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                Button("Mirror all"){
                    guard let value=Double(plane) else{error="Enter a valid mirror plane";return}
                    apply{try NativeWorldLabEditor.mirrorSolids($0,ids:ids,axis:axis,planeMeters:value)}
                }.disabled(ids.isEmpty)
            }
            HStack{
                TextField("Pattern spacing m",text:$patternSpacing).keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                TextField("Copies",text:$copies).keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button("Linear pattern"){
                    guard let step=Double(patternSpacing),let count=Int(copies) else{
                        error="Enter valid spacing and copies";return
                    }
                    apply{try NativeWorldLabEditor.linearPatternSolids($0,ids:ids,
                        axis:axis,spacingMeters:step,copies:count)}
                }.disabled(ids.isEmpty)
            }
            HStack{
                TextField("Centre X,Y,Z m",text:$center).textFieldStyle(.roundedBorder)
                TextField("Instances",text:$instances).keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button("Circular pattern"){
                    let coordinates=center.split(separator:",").compactMap{Double($0.trimmingCharacters(in:.whitespaces))}
                    guard coordinates.count==3,let count=Int(instances) else{
                        error="Enter three centre coordinates and an instance count";return
                    }
                    apply{try NativeWorldLabEditor.circularPatternSolids($0,ids:ids,
                        axis:axis,centerMeters:coordinates,instances:count)}
                }.disabled(ids.isEmpty)
            }
            if !error.isEmpty{Text(error).font(.caption).foregroundStyle(.red)}
        }
        .padding(10)
        .background(Color.secondary.opacity(0.07),in:RoundedRectangle(cornerRadius:12))
        .onAppear{
            if selected.isEmpty,let id=project.entities.first?.id{selected.insert(id)}
        }
        .onChange(of:project.revision){_ in
            let valid=Set(project.entities.map{$0.id})
            selected=selected.intersection(valid)
        }
    }
}


// MARK: - Bounded inventor-driven road and flight vehicle reference model

enum NativeWorldLabVehicleMode:String,CaseIterable,Codable,Identifiable {
    case roadOnly="road-only"
    case rotorcraft="rotorcraft"
    case fixedWing="fixed-wing"
    var id:String{rawValue}
    var title:String {
        switch self {case .roadOnly:return "Road";case .rotorcraft:return "Rotorcraft";case .fixedWing:return "Fixed wing"}
    }
}

struct NativeWorldLabVehicleInput:Codable,Equatable {
    var mode:NativeWorldLabVehicleMode = .roadOnly
    var massKg=1200.0,frontalAreaM2=2.2,dragCoefficient=0.32,airDensityKgM3=1.225
    var rollingResistance=0.012,tireFriction=0.9,maxWheelForceN=6500.0
    var motorMaxPowerW=180000.0,motorEfficiency=0.9,motorForceConstantNPerA=40.0
    var motorWindingResistanceOhm=0.08,motorMaxCurrentA=220.0
    var batteryVoltageV=400.0,batteryResistanceOhm=0.04,batteryMaxCurrentA=500.0
    var batteryCapacityWh=60000.0,initialSOC=1.0,batteryHeatCapacityJPerK=180000.0
    var batteryCoolingWPerK=35.0,maxBatteryTemperatureK=370.0
    var motorHeatCapacityJPerK=45000.0,motorCoolingWPerK=80.0,maxMotorTemperatureK=420.0
    var ambientTemperatureK=293.15,initialMotorTemperatureK=293.15,initialBatteryTemperatureK=293.15
    var rotorDiskAreaM2:Double? = nil,rotorMaxThrustN:Double? = nil,rotorThrottle=0.85,rotorEfficiency=0.8
    var wingAreaM2:Double? = nil,wingLiftCoefficient:Double? = nil,takeoffSpeedMps:Double? = nil
    var maxCruiseThrustN=1800.0,cruiseEfficiency=0.78
    var driveThrottle=0.8,maxSpeedMps=80.0,maxStructuralLoadFactor=3.0
    var durationSeconds=20.0,solverStepSeconds=0.02,motorFailureAtSeconds:Double? = nil
}

struct NativeWorldLabVehicleSample:Codable {
    let timeSeconds:Double,distanceMeters:Double,altitudeMeters:Double
    let horizontalSpeedMps:Double,verticalSpeedMps:Double
    let wheelDriveForceN:Double,cruiseThrustN:Double,rotorThrustN:Double,wingLiftN:Double,dragN:Double,normalForceN:Double
    let loadFactor:Double,batteryCurrentA:Double,terminalVoltageV:Double,batteryPowerW:Double,batterySOC:Double
    let batteryTemperatureK:Double,motorTemperatureK:Double,airborne:Bool,powerLimited:Bool,motorAvailable:Bool,energyUsedWh:Double
}

struct NativeWorldLabVehicleRun:Codable {
    let format:String
    let projectId:String
    let projectRevision:Int
    let runId:String
    let modelVersion:String
    let evidence:String
    let input:NativeWorldLabVehicleInput
    let weightN:Double
    let maximumBatteryPowerW:Double
    let preflight:[String]
    let samples:[NativeWorldLabVehicleSample]
    let events:[String]
    let outcome:String
    let failureReasons:[String]
    let validity:String
}

enum NativeWorldLabVehicle {
    private static let g=9.80665
    private struct State {
        var x=0.0,z=0.0,vx=0.0,vz=0.0
        var soc:Double
        var motorK:Double
        var batteryK:Double
        var energyWh=0.0
        var airborne=false
        var motorFailed=false
        var failure:String?=nil
    }
    private struct Force {
        let wheel:Double,cruise:Double,rotor:Double,wing:Double,drag:Double,normal:Double,load:Double
        let current:Double,voltage:Double,power:Double,motorHeat:Double,batteryHeat:Double
        let limited:Bool,motorAvailable:Bool,airborne:Bool
    }
    private static func range(_ value:Double,_ label:String,_ minimum:Double,_ maximum:Double)throws {
        guard value.isFinite,value>=minimum,value<=maximum else {
            throw NativeWorldLabError.invalid("\(label) must be finite and between \(minimum) and \(maximum).")
        }
    }
    static func validate(_ i:NativeWorldLabVehicleInput)throws {
        let limits:[(Double,String,Double,Double)]=[
            (i.massKg,"Mass",100,30000),(i.frontalAreaM2,"Frontal area",0.2,50),(i.dragCoefficient,"Drag coefficient",0.05,2.5),
            (i.airDensityKgM3,"Air density",0.2,2),(i.rollingResistance,"Rolling resistance",0.001,0.2),
            (i.tireFriction,"Tire friction",0.05,2.5),(i.maxWheelForceN,"Wheel force",10,500000),
            (i.motorMaxPowerW,"Motor power",100,50000000),(i.motorEfficiency,"Motor efficiency",0.2,0.99),
            (i.motorForceConstantNPerA,"Motor force constant",0.01,10000),(i.motorWindingResistanceOhm,"Motor winding resistance",0.0001,100),
            (i.motorMaxCurrentA,"Motor current",0.1,10000),(i.batteryVoltageV,"Battery voltage",12,2000),
            (i.batteryResistanceOhm,"Battery resistance",0,10),(i.batteryMaxCurrentA,"Battery current",0.1,20000),
            (i.batteryCapacityWh,"Battery capacity",10,100000000),(i.initialSOC,"Initial SOC",0.01,1),
            (i.batteryHeatCapacityJPerK,"Battery heat capacity",10,100000000),(i.batteryCoolingWPerK,"Battery cooling",0,100000),
            (i.maxBatteryTemperatureK,"Battery temperature limit",250,600),(i.motorHeatCapacityJPerK,"Motor heat capacity",10,100000000),
            (i.motorCoolingWPerK,"Motor cooling",0,100000),(i.maxMotorTemperatureK,"Motor temperature limit",250,800),
            (i.ambientTemperatureK,"Ambient temperature",180,360),(i.initialMotorTemperatureK,"Initial motor temperature",180,800),
            (i.initialBatteryTemperatureK,"Initial battery temperature",180,600),(i.rotorThrottle,"Rotor throttle",0,1),
            (i.rotorEfficiency,"Rotor efficiency",0.2,0.95),(i.maxCruiseThrustN,"Cruise thrust",0,500000),
            (i.cruiseEfficiency,"Cruise efficiency",0.2,0.95),(i.driveThrottle,"Drive throttle",0,1),
            (i.maxSpeedMps,"Maximum speed",1,300),(i.maxStructuralLoadFactor,"Structural load factor",1,20),
            (i.durationSeconds,"Duration",0.1,120),(i.solverStepSeconds,"Solver step",0.001,0.05)
        ]
        for item in limits { try range(item.0,item.1,item.2,item.3) }
        guard Int(ceil(i.durationSeconds/i.solverStepSeconds))<=12000 else {
            throw NativeWorldLabError.invalid("Vehicle run exceeds its 12,000-step local computation budget.")
        }
        if let value=i.rotorDiskAreaM2 { try range(value,"Rotor disk area",0.05,500) }
        if let value=i.rotorMaxThrustN { try range(value,"Rotor maximum thrust",10,1000000) }
        if let value=i.wingAreaM2 { try range(value,"Wing area",0.5,500) }
        if let value=i.wingLiftCoefficient { try range(value,"Wing lift coefficient",0.05,3) }
        if let value=i.takeoffSpeedMps { try range(value,"Takeoff speed",5,150) }
        if let value=i.motorFailureAtSeconds { try range(value,"Motor failure time",0,i.durationSeconds) }
        if i.mode == .rotorcraft && (i.rotorDiskAreaM2 == nil || i.rotorMaxThrustN == nil) {
            throw NativeWorldLabError.invalid("Rotorcraft mode requires disk area and maximum rotor thrust assumptions.")
        }
        if i.mode == .fixedWing && (i.wingAreaM2 == nil || i.wingLiftCoefficient == nil || i.takeoffSpeedMps == nil) {
            throw NativeWorldLabError.invalid("Fixed-wing mode requires wing area, lift coefficient and takeoff speed assumptions.")
        }
        if i.mode != .roadOnly && i.maxCruiseThrustN<=0 {
            throw NativeWorldLabError.invalid("A flying vehicle needs an assumed horizontal cruise thrust.")
        }
        guard i.initialMotorTemperatureK<i.maxMotorTemperatureK && i.initialBatteryTemperatureK<i.maxBatteryTemperatureK else {
            throw NativeWorldLabError.invalid("Initial temperatures must be below configured limits.")
        }
    }
    private static func maxBatteryPower(_ i:NativeWorldLabVehicleInput,_ soc:Double,_ temp:Double)->Double {
        if soc<=0 || temp>=i.maxBatteryTemperatureK{return 0}
        let derate=temp<=i.maxBatteryTemperatureK-20 ? 1 : max(0,min(1,(i.maxBatteryTemperatureK-temp)/20))
        let voc=i.batteryVoltageV*(0.9+0.1*max(0,min(1,soc)))
        let current=min(i.batteryMaxCurrentA*derate,i.batteryResistanceOhm>0 ? voc/(2*i.batteryResistanceOhm):i.batteryMaxCurrentA*derate)
        return max(0,current*(voc-current*i.batteryResistanceOhm))
    }
    private static func rotorPower(_ thrust:Double,_ area:Double,_ density:Double,_ efficiency:Double)->Double {
        thrust<=0 ? 0 : pow(thrust,1.5)/sqrt(2*density*area)/efficiency
    }
    private static func currentForPower(_ power:Double,_ voc:Double,_ resistance:Double)throws->Double {
        if power<=0{return 0}
        if resistance<=1e-12{return power/voc}
        let d=voc*voc-4*resistance*power
        guard d >= -1e-6 else {throw NativeWorldLabError.invalid("Battery request exceeds its resistive discharge envelope.")}
        return (voc-sqrt(max(0,d)))/(2*resistance)
    }
    private static func forces(_ i:NativeWorldLabVehicleInput,_ s:State,_ time:Double,_ weight:Double)throws->Force {
        let speed=hypot(s.vx,s.vz)
        let wing=i.mode == .fixedWing ? 0.5*i.airDensityKgM3*speed*speed*i.wingAreaM2!*i.wingLiftCoefficient!:0
        let battery=maxBatteryPower(i,s.soc,s.batteryK)
        let available=s.failure == nil && !s.motorFailed && (i.motorFailureAtSeconds == nil || time<i.motorFailureAtSeconds!)
        let rotorRequest=i.mode == .rotorcraft ? i.rotorMaxThrustN!*i.rotorThrottle:0
        let rotorRequestPower=i.mode == .rotorcraft ? rotorPower(rotorRequest,i.rotorDiskAreaM2!,i.airDensityKgM3,i.rotorEfficiency):0
        let rotorScale=rotorRequestPower>battery && rotorRequestPower>0 ? pow(battery/rotorRequestPower,2.0/3.0):1
        let rotor=rotorRequest*rotorScale
        let rotorW=rotorPower(rotor,i.rotorDiskAreaM2 ?? 1,i.airDensityKgM3,i.rotorEfficiency)
        let canLift=i.mode == .rotorcraft ? rotor+wing>=weight : i.mode == .fixedWing && speed>=i.takeoffSpeedMps! && wing>=weight
        let airborne=s.airborne || canLift
        let normal=airborne ? 0 : max(0,weight-wing-rotor)
        let drag=0.5*i.airDensityKgM3*i.dragCoefficient*i.frontalAreaM2*speed*speed
        var wheel=available && !airborne ? min(i.driveThrottle*i.maxWheelForceN,min(i.tireFriction*normal,min(i.motorMaxCurrentA*i.motorForceConstantNPerA,i.motorMaxPowerW*i.motorEfficiency/max(s.vx,0.5)))):0
        var cruise=available && airborne && i.mode != .roadOnly ? i.maxCruiseThrustN*i.driveThrottle:0
        let wheelP=wheel*max(s.vx,0.5),wheelI=wheel/i.motorForceConstantNPerA
        let cruiseP=cruise*max(speed,0.5)/i.cruiseEfficiency
        let motorP=max(wheelP/i.motorEfficiency,wheelI*wheelI*i.motorWindingResistanceOhm)+cruiseP
        let remaining=max(0,battery-rotorW)
        let currentLimit=max(0,min(i.motorMaxCurrentA,i.batteryMaxCurrentA)-rotorW/max(i.batteryVoltageV*0.8,1))
        let requestedCurrent=wheelI+cruiseP/max(i.batteryVoltageV*0.8,1)
        let currentScale=requestedCurrent>0 ? min(1,currentLimit/requestedCurrent):1
        let powerScale=motorP>remaining && motorP>0 ? remaining/motorP:1
        let nameplateScale=motorP>i.motorMaxPowerW && motorP>0 ? i.motorMaxPowerW/motorP:1
        let scale=min(currentScale,min(powerScale,nameplateScale))
        let limited=scale<0.999999 || rotorScale<0.999999
        wheel*=scale;cruise*=scale
        let actualWheelI=wheel/i.motorForceConstantNPerA
        let actualWheelP=wheel*max(s.vx,0.5)
        let actualCruiseP=cruise*max(speed,0.5)/i.cruiseEfficiency
        let copper=actualWheelI*actualWheelI*i.motorWindingResistanceOhm
        let actualMotorP=max(actualWheelP/i.motorEfficiency,copper)+actualCruiseP
        let total=min(battery,rotorW+actualMotorP)
        let voc=i.batteryVoltageV*(0.9+0.1*s.soc)
        let current=try currentForPower(total,voc,i.batteryResistanceOhm)
        let terminal=max(0,voc-current*i.batteryResistanceOhm)
        let motorHeat=max(0,actualMotorP-actualWheelP-cruise*max(speed,0.5))
        let batteryHeat=current*current*i.batteryResistanceOhm
        return Force(wheel:wheel,cruise:cruise,rotor:rotor,wing:wing,drag:drag,normal:normal,
            load:max(0,(wing+rotor)/weight),current:current,voltage:terminal,power:total,
            motorHeat:motorHeat,batteryHeat:batteryHeat,limited:limited,motorAvailable:available,airborne:airborne)
    }
    static func evaluate(_ project:NativeWorldLabProject,_ runId:String,_ input:NativeWorldLabVehicleInput)throws->NativeWorldLabVehicleRun {
        try validate(input)
        guard project.revision>=0,runId.range(of:"^[A-Za-z0-9_-]{1,120}$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Vehicle run needs a valid project revision and run ID.")
        }
        let weight=input.massKg*g,maximumBattery=maxBatteryPower(input,input.initialSOC,input.initialBatteryTemperatureK)
        var diagnostics:[String]=[]
        if input.mode == .rotorcraft {
            let hover=rotorPower(weight,input.rotorDiskAreaM2!,input.airDensityKgM3,input.rotorEfficiency)
            if input.rotorMaxThrustN!<weight{diagnostics.append("BLOCKER: Rotor thrust is below vehicle weight.")}
            if input.rotorMaxThrustN!<1.2*weight{diagnostics.append("WARNING: Rotor thrust margin is below 20%.")}
            if hover>maximumBattery{diagnostics.append("BLOCKER: Ideal induced hover power exceeds battery discharge capacity.")}
        }
        if input.mode == .fixedWing {
            let lift=0.5*input.airDensityKgM3*pow(input.takeoffSpeedMps!,2)*input.wingAreaM2!*input.wingLiftCoefficient!
            if lift<weight{diagnostics.append("BLOCKER: Wing lift at configured takeoff speed is below vehicle weight.")}
            let drag=0.5*input.airDensityKgM3*input.dragCoefficient*input.frontalAreaM2*pow(input.takeoffSpeedMps!,2)
            if input.maxCruiseThrustN<drag{diagnostics.append("BLOCKER: Cruise thrust is below estimated takeoff drag.")}
        }
        diagnostics.append("INFO: Longitudinal point-mass model on a level road; no 6-DOF stability, detailed rotor aerodynamics, suspension or flight certification.")
        let n=Int(ceil(input.durationSeconds/input.solverStepSeconds)),h=input.durationSeconds/Double(n)
        var state=State(soc:input.initialSOC,motorK:input.initialMotorTemperatureK,batteryK:input.initialBatteryTemperatureK)
        var samples:[NativeWorldLabVehicleSample]=[],events:[String]=[],failures:[String]=[]
        var lastAirborne=false,limitRecorded=false
        for step in 0...n {
            let t=Double(step)*h
            let f=try forces(input,state,t,weight)
            if f.airborne && !lastAirborne{events.append(String(format:"Takeoff at %.2f s.",t))}
            if !f.airborne && lastAirborne{events.append(String(format:"Touchdown at %.2f s.",t))}
            if f.limited && !limitRecorded{events.append(String(format:"Battery or motor power was limited at %.2f s.",t));limitRecorded=true}
            if !state.motorFailed,let failTime=input.motorFailureAtSeconds,t>=failTime {
                events.append(String(format:"Injected motor dropout at %.2f s; wheel/cruise drive is disabled.",t))
                state.motorFailed=true
            }
            let sample=NativeWorldLabVehicleSample(timeSeconds:t,distanceMeters:state.x,altitudeMeters:state.z,
                horizontalSpeedMps:state.vx,verticalSpeedMps:state.vz,wheelDriveForceN:f.wheel,cruiseThrustN:f.cruise,
                rotorThrustN:f.rotor,wingLiftN:f.wing,dragN:f.drag,normalForceN:f.normal,loadFactor:f.load,
                batteryCurrentA:f.current,terminalVoltageV:f.voltage,batteryPowerW:f.power,batterySOC:state.soc,
                batteryTemperatureK:state.batteryK,motorTemperatureK:state.motorK,airborne:f.airborne,
                powerLimited:f.limited,motorAvailable:f.motorAvailable,energyUsedWh:state.energyWh)
            samples.append(sample)
            if step==n || state.failure != nil{break}
            let speed=hypot(state.vx,state.vz)
            let dragX=speed>1e-12 ? f.drag*state.vx/speed:0
            let dragZ=speed>1e-12 ? f.drag*state.vz/speed:0
            let rolling=f.airborne ? 0:input.rollingResistance*f.normal
            let ax=(f.wheel+f.cruise-dragX-rolling)/input.massKg
            let az=f.airborne ? (f.wing+f.rotor-weight-dragZ)/input.massKg:0
            let vx=max(0,state.vx+ax*h),vz=state.vz+az*h
            var z=state.z+(f.airborne ? max(0,vz):0)*h,varVz=vz,varAirborne=f.airborne
            if z<=1e-6 && varAirborne && varVz<=0{z=0;varVz=0;varAirborne=false}
            let motorTemp=state.motorK+(f.motorHeat-input.motorCoolingWPerK*(state.motorK-input.ambientTemperatureK))*h/input.motorHeatCapacityJPerK
            let batteryTemp=state.batteryK+(f.batteryHeat-input.batteryCoolingWPerK*(state.batteryK-input.ambientTemperatureK))*h/input.batteryHeatCapacityJPerK
            let energy=state.energyWh+f.power*h/3600
            let soc=max(0,state.soc-f.power*h/(3600*input.batteryCapacityWh))
            var failure:String?=nil
            if f.load>input.maxStructuralLoadFactor{failure="Computed lift exceeded the assumed structural load-factor limit.";events.append(failure!)}
            else if motorTemp>=input.maxMotorTemperatureK || batteryTemp>=input.maxBatteryTemperatureK{failure="Motor or battery temperature exceeded its assumed limit.";events.append(failure!)}
            else if vx>input.maxSpeedMps{failure="Vehicle exceeded the configured maximum speed.";events.append(failure!)}
            if let failure{failures.append(failure);state.failure=failure}
            else{state=State(x:state.x+vx*h,z:z,vx:vx,vz:varVz,soc:soc,motorK:motorTemp,batteryK:batteryTemp,energyWh:energy,airborne:varAirborne,motorFailed:state.motorFailed)}
            lastAirborne=f.airborne
        }
        let final=samples.last!
        if input.mode != .roadOnly && !samples.contains(where:{$0.airborne}) && failures.isEmpty{
            failures.append("The vehicle did not reach the configured takeoff/lift conditions within this recorded run.")
        }
        let outcome=state.failure != nil ? "failed":final.airborne ? "airborne":input.mode == .roadOnly ? "ground-run":"unable-to-takeoff"
        let validity="Hypothetical user assumptions; level-road longitudinal point-mass model with simplified wing or actuator-disk rotor lift. No suspension, steering/yaw/roll, tire relaxation, CFD, turbulence, stall, structural FEM, flight-control safety or certification."
        return NativeWorldLabVehicleRun(format:"env-world-lab-native-vehicle-run-v1",projectId:project.id,
            projectRevision:project.revision,runId:runId,modelVersion:"1.0.0",evidence:"physics-model-computed",
            input:input,weightN:weight,maximumBatteryPowerW:maximumBattery,preflight:diagnostics,
            samples:samples,events:events,outcome:outcome,failureReasons:failures,validity:validity)
    }
}

// MARK: - Native UI for the vehicle experiment

private struct NativeWorldLabVehiclePanel:View {
    let project:NativeWorldLabProject
    @State private var input=NativeWorldLabVehicleInput()
    @State private var run:NativeWorldLabVehicleRun?
    @State private var time=0.0
    @State private var playing=false
    @State private var playbackRate=1.0
    @State private var problem=""
    @State private var exporting=false
    @State private var evidenceFile:NativeWorldLabJsonFile?
    private var current:NativeWorldLabVehicleRun? {
        guard let run,run.projectId==project.id,run.projectRevision==project.revision else{return nil}
        return run
    }
    private var sample:NativeWorldLabVehicleSample? {
        guard let current else{return nil}
        let index=Int((time/current.input.durationSeconds*Double(current.samples.count-1)).rounded())
        return current.samples[min(current.samples.count-1,max(0,index))]
    }
    private func calculate(){
        do{
            run=try NativeWorldLabVehicle.evaluate(project,"vehicle-"+UUID().uuidString.replacingOccurrences(of:"-",with:""),input)
            time=0;playing=false;problem=""
        }catch{run=nil;problem=error.localizedDescription}
    }
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            Text("Build, run and diagnose a vehicle").font(.headline)
            Text("Independent native Swift model. Every vehicle, motor and battery value is an inventor assumption; results are not flight certification.")
                .font(.caption).foregroundStyle(.secondary)
            Picker("Vehicle mode",selection:$input.mode){
                ForEach(NativeWorldLabVehicleMode.allCases){mode in Text(mode.title).tag(mode)}
            }.pickerStyle(.segmented).onChange(of:input.mode){_ in run=nil;playing=false}
            HStack{
                TextField("Mass kg",value:$input.massKg,format:.number).keyboardType(.decimalPad)
                TextField("Frontal area m²",value:$input.frontalAreaM2,format:.number).keyboardType(.decimalPad)
            }
            HStack{
                TextField("Drag coefficient",value:$input.dragCoefficient,format:.number).keyboardType(.decimalPad)
                TextField("Tire friction",value:$input.tireFriction,format:.number).keyboardType(.decimalPad)
            }
            VStack(alignment:.leading){
                Text("Drive throttle "+String(format:"%.0f",input.driveThrottle*100)+"%").font(.caption)
                Slider(value:$input.driveThrottle,in:0...1)
            }
            if input.mode == .rotorcraft {
                HStack {
                    TextField("Rotor disk area m²",value:Binding(get:{input.rotorDiskAreaM2 ?? 15},set:{input.rotorDiskAreaM2=$0}),format:.number)
                    TextField("Max rotor thrust N",value:Binding(get:{input.rotorMaxThrustN ?? 10000},set:{input.rotorMaxThrustN=$0}),format:.number)
                }
                VStack(alignment:.leading){Text("Rotor throttle").font(.caption);Slider(value:$input.rotorThrottle,in:0...1)}
            }
            if input.mode == .fixedWing {
                HStack {
                    TextField("Wing area m²",value:Binding(get:{input.wingAreaM2 ?? 18},set:{input.wingAreaM2=$0}),format:.number)
                    TextField("Lift coefficient",value:Binding(get:{input.wingLiftCoefficient ?? 1.4},set:{input.wingLiftCoefficient=$0}),format:.number)
                }
                TextField("Takeoff speed m/s",value:Binding(get:{input.takeoffSpeedMps ?? 28},set:{input.takeoffSpeedMps=$0}),format:.number)
            }
            if input.mode != .roadOnly {
                TextField("Horizontal cruise thrust N",value:$input.maxCruiseThrustN,format:.number)
            }
            HStack {
                TextField("Duration seconds",value:$input.durationSeconds,format:.number)
                TextField("Maximum structural load (g)",value:$input.maxStructuralLoadFactor,format:.number)
            }
            Button("Run native vehicle experiment"){calculate()}.buttonStyle(.borderedProminent)
            if !problem.isEmpty{Text(problem).font(.caption).foregroundStyle(.red)}
            if let run=current,let sample {
                Text("Computed vehicle state · "+run.outcome.replacingOccurrences(of:"-",with:" ")).font(.headline)
                Grid(alignment:.leading,horizontalSpacing:15,verticalSpacing:5){
                    GridRow{Text("Speed");Text(String(format:"%.3f m/s",sample.horizontalSpeedMps))}
                    GridRow{Text("Altitude");Text(String(format:"%.3f m",sample.altitudeMeters))}
                    GridRow{Text("Wheel drive");Text(String(format:"%.3f N",sample.wheelDriveForceN))}
                    GridRow{Text("Lift");Text(String(format:"%.3f N",sample.rotorThrustN+sample.wingLiftN))}
                    GridRow{Text("Battery");Text(String(format:"%.2f A · %.2f V · %.1f%%",sample.batteryCurrentA,sample.terminalVoltageV,sample.batterySOC*100))}
                    GridRow{Text("Motor temperature");Text(String(format:"%.2f K",sample.motorTemperatureK))}
                    GridRow{Text("Battery temperature");Text(String(format:"%.2f K",sample.batteryTemperatureK))}
                }.font(.caption)
                VStack(alignment:.leading){
                    Text("Recorded simulation time "+String(format:"%.2f / %.2f s",time,run.samples.last?.timeSeconds ?? 0)).font(.caption)
                    Slider(value:$time,in:0...max(0.001,run.samples.last?.timeSeconds ?? 0))
                }
                HStack{
                    Button(playing ? "Pause":"Play"){playing.toggle()}.buttonStyle(.bordered)
                    Button("Reset"){playing=false;time=0}.buttonStyle(.bordered)
                    Button("Step"){playing=false;time=min(run.samples.last?.timeSeconds ?? 0,time+run.input.solverStepSeconds)}.buttonStyle(.bordered)
                    Button("Speed "+String(format:"%.1f",playbackRate)+"×"){playbackRate=playbackRate==0.1 ? 1 : playbackRate==1 ? 10 : 0.1}.buttonStyle(.bordered)
                }
                ForEach(Array(run.preflight.enumerated()),id:\.offset){_,item in Text(item).font(.caption)}
                ForEach(Array(run.events.enumerated()),id:\.offset){_,item in Text(item).font(.caption)}
                ForEach(Array(run.failureReasons.enumerated()),id:\.offset){_,item in Text(item).font(.caption).foregroundStyle(.red)}
                Button("Export native vehicle evidence"){
                    do{
                        let bytes=try JSONEncoder().encode(run)
                        guard bytes.count<=1_048_576 else{throw NativeWorldLabError.invalid("Vehicle evidence exceeds 1 MB")}
                        evidenceFile=NativeWorldLabJsonFile(content:bytes);exporting=true
                    }catch{problem=error.localizedDescription}
                }.buttonStyle(.bordered)
                Text(run.validity).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(10).background(.thinMaterial,in:RoundedRectangle(cornerRadius:12))
        .onChange(of:input){_ in run=nil;playing=false;time=0}
        .task(id:playing){
            while playing {
                try? await Task.sleep(nanoseconds:50_000_000)
                guard let current else{break}
                let end=current.samples.last?.timeSeconds ?? 0
                if time>=end {playing=false;break}
                time=min(end,time+0.05*playbackRate)
            }
        }
        .fileExporter(isPresented:$exporting,document:evidenceFile,contentType:.json,defaultFilename:"world-lab-vehicle-evidence"){result in
            if case .failure(let error)=result{problem=error.localizedDescription}
        }
    }
}


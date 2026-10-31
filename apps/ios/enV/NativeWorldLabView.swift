import SwiftUI
import SceneKit
import UniformTypeIdentifiers

private struct NativeWorldLabJsonFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var content: Data
    init(content: Data){self.content=content}
    init(configuration: ReadConfiguration) throws {
        let bytes=configuration.file.regularFileContents ?? Data()
        guard bytes.count <= NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("World Lab JSON must be 1 MB or smaller")
        }
        content=bytes
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents:content)
    }
}

/// Native 3D *illustrative* scene with real, bounded local reference solvers.
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
    @State private var importing=false
    @State private var exporting=false
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
    @State private var editingMaterialId:String?
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
    @State private var gravitySpeeds:[String:String]=[:]
    @State private var gravitySelectionTouched=false
    @State private var gravitySelectedIds:Set<String>=[]
    @State private var gravityDuration=30.0
    @State private var gravitySteps=480
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
    @State private var lastTick=Date()
    private let timer=Timer.publish(every:0.04,on:.main,in:.common).autoconnect()
    private let localProjects=NativeWorldLabProjectStore()
    private var hasUnsavedWork:Bool { projectData != nil && savedSnapshot != projectData }
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
                    .accessibilityLabel("Illustrative 3D scene; model values are displayed below.")
                Picker("Experiment",selection:$mode){
                    Text("Spring").tag(0);Text("Circuit").tag(1);Text("Heat").tag(2)
                }.pickerStyle(.segmented)
                HStack{
                    Button(playing ? "Pause":"Play"){playing.toggle()}
                        .buttonStyle(.borderedProminent)
                    Button("Reset"){playing=false;seconds=0}.buttonStyle(.bordered)
                    Button("Step"){playing=false;seconds=min(12,seconds+1.0/240)}
                        .buttonStyle(.bordered)
                    Toggle("See inside",isOn:$seeInside).labelsHidden()
                    Text("See inside").font(.caption)
                }
                Text("Simulated time: "+String(format:"%.2f",seconds)+" s")
                Slider(value:$seconds,in:0...12,onEditingChanged:{ editing in
                    if editing{playing=false}
                }).accessibilityLabel("Simulated elapsed time")
                Picker("Playback speed",selection:$speed){
                    Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0)
                }.pickerStyle(.segmented)
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
                Divider()
                HStack {
                    Button("New project"){askToReplace("new")}.buttonStyle(.borderedProminent)
                    Button("Export JSON"){exporting=true}
                        .buttonStyle(.bordered).disabled(projectData==nil)
                }
                Button("Import World Lab project JSON"){askToReplace("import")}.buttonStyle(.bordered)
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
                if !problem.isEmpty {Text(problem).foregroundStyle(.red)}
                Text("Model 1.0.0 · computed with assumed parameters · not a safety assessment.")
                    .font(.caption2).foregroundStyle(.secondary)
            }.padding(14)
        }
    }
    private var sceneSettingsView:some View {
        coreView
        .onAppear{redraw();lastTick=Date();refreshSavedProjects();refreshRecoveryDrafts()}
        .onChange(of:mode){_ in seconds=0;playing=false;redraw()}
        .onChange(of:seconds){_ in redraw()}
        .onChange(of:dropTime){_ in applyDropPosition()}
        .onChange(of:fluidTime){_ in applyFluidPosition()}
        .onChange(of:motorTime){_ in applyMotorPosition()}
        .onChange(of:seeInside){_ in redraw()}
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
            gravityRun=nil;gravityPlaying=false;gravityTime=0
            // Never reuse a prior computed trajectory after geometry/material edits.
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
            beamRun=nil
            collisionPlaying=false;collisionRun=nil;collisionTime=0
            groupPlaying=false;groupRun=nil;groupTime=0
            dropPlaying=false;dropRun=nil;dropEntityId=nil;dropTime=0
            motorPlaying=false;motorRun=nil;digitalMotor=nil;motorEntityId=nil;motorTime=0;redraw()
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
            if gravityPlaying,let run=gravityRun {
                gravityTime=min(run.durationSeconds,gravityTime+dt*gravityRate)
                updateGravityScene()
                if gravityTime>=run.durationSeconds {gravityPlaying=false}
            }
            if groupPlaying,let run=groupRun {
                groupTime=min(run.durationSeconds,groupTime+dt*groupPlaybackRate)
                updateGroupSphereScene()
                if groupTime>=run.durationSeconds {groupPlaying=false}
            }
            if spherePlaying,let run=sphereRun {
                sphereTime=min(run.durationSeconds,sphereTime+dt*sphereSpeed)
                updateSphereScene()
                if sphereTime>=run.durationSeconds {spherePlaying=false}
            }
            if collisionPlaying,let run=collisionRun {
                collisionTime=min(run.durationSeconds,collisionTime+dt*collisionSpeed)
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
    private var importExportView:some View {
        interactionView
        .fileExporter(isPresented:$exporting,
            document:projectData.map{NativeWorldLabJsonFile(content:$0)},
            contentType:.json,defaultFilename:"world-lab-project"){result in
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
        .fileImporter(isPresented:$importing,allowedContentTypes:[.json]){response in
            do {
                let url=try response.get()
                let accessed=url.startAccessingSecurityScopedResource()
                defer{if accessed{url.stopAccessingSecurityScopedResource()}}
                // File-size metadata must be available and bounded before
                // allocating memory for untrusted imported project contents.
                let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
                guard let length=(attributes[.size] as? NSNumber)?.intValue,
                      length<=NativeWorldLabProject.maxBytes else {
                    throw NativeWorldLabError.invalid("Project files must be 1 MB or smaller.")
                }
                let data=try Data(contentsOf:url)
                project=try NativeWorldLabProject.decode(data)
                projectData=data
                savedSnapshot=nil
                editHistory.clear()
                selected=0;problem="";redraw()
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
                            candidate.id != chosen.id &&
                            !(project.assemblies ?? []).contains(where:{
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
                            let conductivity=try inventedConductivity.trimmingCharacters(
                                in:.whitespaces).isEmpty ? nil : Double(inventedConductivity)
                            let heatCapacity=try inventedSpecificHeat.trimmingCharacters(
                                in:.whitespaces).isEmpty ? nil : Double(inventedSpecificHeat)
                            if !inventedConductivity.trimmingCharacters(in:.whitespaces).isEmpty &&
                               conductivity==nil {
                                throw NativeWorldLabError.invalid("Conductivity must be numeric")
                            }
                            if !inventedSpecificHeat.trimmingCharacters(in:.whitespaces).isEmpty &&
                               heatCapacity==nil {
                                throw NativeWorldLabError.invalid("Specific heat must be numeric")
                            }
                            let id=UUID().uuidString
                            applyProject {old in
                                if let editingMaterialId {
                                    return try NativeWorldLabEditor.reviseHypotheticalMaterial(
                                        old,id:editingMaterialId,name:inventedName,
                                        densityKgM3:density,youngModulusPa:modulus,
                                        thermalConductivityWPerMK:conductivity,
                                        specificHeatJPerKgK:heatCapacity)
                                }
                                let first=try NativeWorldLabEditor.addHypotheticalMaterial(
                                    old,name:inventedName,densityKgM3:density,
                                    youngModulusPa:modulus,id:id,
                                    thermalConductivityWPerMK:conductivity,
                                    specificHeatJPerKgK:heatCapacity)
                                if let solid {
                                    return try NativeWorldLabEditor.assignMaterial(
                                        first,solidId:solid.id,materialId:id)
                                }
                                return first
                            }
                            if problem.isEmpty {
                                inventedName="";inventedDensity="";inventedModulus=""
                                inventedConductivity="";inventedSpecificHeat=""
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
        Text("Genuine local Newtonian attraction, computed from each sphere's "+
             "invented density and starting velocity. Nothing is uploaded "+
             "and no measured planet or impact is inferred.")
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
                Text("The native solver supports up to 8 bodies offline. "+
                     "Reduce the selection; no automatic cloud upload occurs.")
                    .font(.caption)
            }
        }
        if let run=gravityRun,run.projectId==project.id,
           run.projectRevision==project.revision {
            value("Numerical energy drift",run.energyDriftFraction*100,"%")
            Text("Simulated gravity time: "+
                 String(format:"%.2f",gravityTime)+" seconds")
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
            HStack {
                Button(groupPlaying ? "Pause group":"Play group"){
                    groupPlaying.toggle()
                }
                Button("Reset group"){
                    groupPlaying=false;groupTime=0;updateGroupSphereScene()
                }
            }.buttonStyle(.bordered)
            Picker("Group impact playback speed",selection:$groupPlaybackRate) {
                Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("4×").tag(4.0)
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
            HStack{
                Button(spherePlaying ? "Pause 3D impact":"Play 3D impact"){
                    spherePlaying.toggle()
                }
                Button("Reset 3D impact"){
                    spherePlaying=false;sphereTime=0;updateSphereScene()
                }
            }.buttonStyle(.bordered)
            Picker("3D collision playback rate",selection:$sphereSpeed){
                Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("4×").tag(4.0)
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
            HStack {
                Button(collisionPlaying ? "Pause collision":"Play collision"){
                    collisionPlaying.toggle()
                }
                Button("Reset collision"){
                    collisionPlaying=false;collisionTime=0;updateCollisionScene()
                }
            }.buttonStyle(.bordered)
            Picker("Collision playback speed",selection:$collisionSpeed){
                Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("4×").tag(4.0)
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
    private func redraw(){
        let next=SCNScene()
        let floor=SCNNode(geometry:SCNFloor())
        floor.geometry?.firstMaterial?.diffuse.contents=UIColor.systemGreen
        next.rootNode.addChildNode(floor)
        if let project {
            for item in project.entities.prefix(200){
                let xyz=item.dimensionsMeters
                let geometry:SCNGeometry
                switch item.shape{
                case "sphere":geometry=SCNSphere(radius:CGFloat(xyz[0]/2))
                case "cylinder":geometry=SCNCylinder(radius:CGFloat(xyz[0]/2),height:CGFloat(xyz[1]))
                default:geometry=SCNBox(width:CGFloat(xyz[0]),height:CGFloat(xyz[1]),
                                         length:CGFloat(xyz[2]),chamferRadius:0)
                }
                let node=SCNNode(geometry:geometry)
                node.name="lab-solid-"+item.id
                node.position=SCNVector3(Float(item.positionMeters[0]),
                    Float(item.positionMeters[1]),Float(item.positionMeters[2]))
                if let hex=UInt64(item.color.dropFirst(),radix:16){
                    geometry.firstMaterial?.diffuse.contents=UIColor(
                        red:CGFloat((hex>>16)&255)/255,
                        green:CGFloat((hex>>8)&255)/255,
                        blue:CGFloat(hex&255)/255,alpha:1)
                }
                geometry.firstMaterial?.transparency=(seeInside ? 0.4:1)*CGFloat(item.opacity)
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
        let camera=SCNNode()
        camera.camera=SCNCamera()
        camera.position=SCNVector3(0,3,-8)
        camera.look(at:SCNVector3(0,1,0))
        next.rootNode.addChildNode(camera)
        scene=next
        applyDropPosition()
        applyMotorPosition()
    }
}

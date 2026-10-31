package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * Validated, portable World Lab v1 edits. Every edit decodes the complete result
 * with the same strict schema used by imported projects. No executable content,
 * unknown measurements, shader scripts or hidden simulation coupling.
 */
object NativeWorldLabEditor {
    private fun edit(source: String, mutation: (JSONObject)->Unit): String {
        NativeWorldLabProjectCodec.decode(source)
        val root=JSONObject(source)
        mutation(root)
        val revision=root.getInt("revision")
        require(revision<1_000_000_000){"The project revision limit has been reached."}
        root.put("revision",revision+1)
        root.put("updatedAt",Instant.now().toString())
        val result=root.toString()
        NativeWorldLabProjectCodec.decode(result)
        return result
    }
    fun blank(title: String="Untitled World Lab"): String {
        val now=Instant.now().toString()
        val project=JSONObject()
            .put("format","env-world-lab")
            .put("schemaVersion",1)
            .put("id",UUID.randomUUID().toString())
            .put("title",title)
            .put("revision",0)
            .put("createdAt",now)
            .put("updatedAt",now)
            .put("world",JSONObject()
                .put("frame","LOCAL_ENU")
                .put("representation","representative-not-measured")
                .put("origin",JSONArray(listOf(0,0,0)))
                .put("terrainSource",JSONObject.NULL))
            .put("camera",JSONObject()
                .put("positionMeters",JSONArray(listOf(0,1.65,-8)))
                .put("lookingAtMeters",JSONArray(listOf(0,1.2,0))))
            .put("entities",JSONArray())
            .put("materials",JSONArray())
            .put("networks",JSONArray())
        val json=project.toString()
        NativeWorldLabProjectCodec.decode(json)
        return json
    }
    fun addStarterCircuit(source:String,id:String=UUID.randomUUID().toString()):String =
        edit(source){root->
            val networks=root.optJSONArray("networks")?:JSONArray().also{root.put("networks",it)}
            require(networks.length()<12){"Too many electrical networks"}
            networks.put(JSONObject().put("id",id).put("name","My first circuit")
                .put("groundNodeId","ground")
                .put("nodes",JSONArray()
                    .put(JSONObject().put("id","ground").put("label","Ground"))
                    .put(JSONObject().put("id","supply").put("label","Powered rail")))
                .put("components",JSONArray()
                    .put(JSONObject().put("id","source").put("kind","dc-source")
                        .put("positiveNodeId","supply").put("negativeNodeId","ground")
                        .put("voltageV",9.0))
                    .put(JSONObject().put("id","load").put("kind","resistor")
                        .put("positiveNodeId","supply").put("negativeNodeId","ground")
                        .put("resistanceOhm",100.0))))
        }
    fun addCircuitNode(source:String,label:String,id:String=UUID.randomUUID().toString()):String =
        edit(source){project->
            val title=label.trim()
            require(title.isNotEmpty()&&title.length<=80){"A wire junction needs a short name"}
            val network=project.getJSONArray("networks").getJSONObject(0)
            val nodes=network.getJSONArray("nodes")
            require(nodes.length()<24){"Circuit supports at most 24 electrical nodes"}
            require((0 until nodes.length()).none{nodes.getJSONObject(it).getString("id")==id}){
                "Duplicate wire junction ID"
            }
            nodes.put(JSONObject().put("id",id).put("label",title))
        }
    fun addCircuitResistor(source:String,positive:String,negative:String,
        resistanceOhm:Double=200.0,id:String=UUID.randomUUID().toString()):String =
        edit(source){project->
            require(resistanceOhm.isFinite()&&resistanceOhm in 0.01..1e9){
                "Resistance must be a bounded, positive Ohmic assumption"
            }
            val network=project.getJSONArray("networks").getJSONObject(0)
            val nodes=network.getJSONArray("nodes")
            val ids=(0 until nodes.length()).map{nodes.getJSONObject(it).getString("id")}
            require(positive in ids&&negative in ids&&positive!=negative){
                "Connect two different existing node terminals"
            }
            val components=network.getJSONArray("components")
            require(components.length()<48 && (0 until components.length()).none{
                components.getJSONObject(it).getString("id")==id
            }){"The resistor ID or component capacity is invalid"}
            components.put(JSONObject().put("id",id).put("kind","resistor")
                .put("positiveNodeId",positive).put("negativeNodeId",negative)
                .put("resistanceOhm",resistanceOhm))
        }
    fun rewireCircuitPart(source:String,id:String,positive:String,negative:String):String =
        edit(source){project->
            val network=project.getJSONArray("networks").getJSONObject(0)
            val nodes=network.getJSONArray("nodes")
            val nodeIds=(0 until nodes.length()).map{nodes.getJSONObject(it).getString("id")}
            require(positive in nodeIds&&negative in nodeIds&&positive!=negative){
                "Component terminals must connect different real nodes"
            }
            val parts=network.getJSONArray("components")
            val index=(0 until parts.length()).firstOrNull{
                parts.getJSONObject(it).getString("id")==id
            }?:error("Selected circuit part no longer exists")
            parts.getJSONObject(index).put("positiveNodeId",positive)
                .put("negativeNodeId",negative)
        }
    fun removeUnusedCircuitNode(source:String,id:String):String=edit(source){project->
        val network=project.getJSONArray("networks").getJSONObject(0)
        require(id!=network.getString("groundNodeId")){"Ground cannot be removed"}
        val nodes=network.getJSONArray("nodes")
        require(nodes.length()>2){"At least two electrical nodes are required"}
        val parts=network.getJSONArray("components")
        require((0 until parts.length()).none{
            val part=parts.getJSONObject(it)
            part.getString("positiveNodeId")==id||part.getString("negativeNodeId")==id
        }){"Unwire every component before removing this node"}
        val remaining=JSONArray()
        var removed=false
        for(i in 0 until nodes.length()){
            val node=nodes.getJSONObject(i)
            if(node.getString("id")==id)removed=true else remaining.put(node)
        }
        require(removed){"Wire junction does not exist"}
        network.put("nodes",remaining)
    }
    fun addParallelCircuitResistor(source:String):String=edit(source){root->
        val networks=root.getJSONArray("networks")
        require(networks.length()>0)
        val components=networks.getJSONObject(0).getJSONArray("components")
        require(components.length()<48)
        val sourcePart=(0 until components.length()).map{components.getJSONObject(it)}
            .firstOrNull{it.getString("kind")=="dc-source"}
            ?:error("Circuit needs a voltage source before adding a parallel load")
        components.put(JSONObject().put("id",UUID.randomUUID().toString())
            .put("kind","resistor")
            .put("positiveNodeId",sourcePart.getString("positiveNodeId"))
            .put("negativeNodeId",sourcePart.getString("negativeNodeId"))
            .put("resistanceOhm",200.0))
    }
    fun adjustCircuitComponent(source:String,id:String,delta:Double):String=edit(source){root->
        require(delta.isFinite()){"Circuit adjustment must be finite"}
        val components=root.getJSONArray("networks").getJSONObject(0).getJSONArray("components")
        val index=(0 until components.length()).firstOrNull{
            components.getJSONObject(it).getString("id")==id
        }?:error("Selected circuit part no longer exists")
        val component=components.getJSONObject(index)
        when(component.getString("kind")){
            "dc-source"->component.put("voltageV",
                (component.getDouble("voltageV")+delta).coerceIn(-1000.0,1000.0))
            "resistor"->component.put("resistanceOhm",
                (component.getDouble("resistanceOhm")+delta).coerceIn(0.01,1e9))
            else->error("Unknown device has no supported electrical parameter to adjust")
        }
    }
    fun removeCircuitComponent(source:String,id:String):String=edit(source){root->
        val components=root.getJSONArray("networks").getJSONObject(0).getJSONArray("components")
        require(components.length()>1){"Cannot remove the final circuit part"}
        val remaining=JSONArray()
        var removed=false
        for(index in 0 until components.length()){
            val part=components.getJSONObject(index)
            if(part.getString("id")==id){
                require(part.getString("kind")!="dc-source"){"Keep the circuit's voltage source"}
                removed=true
            }else remaining.put(part)
        }
        require(removed){"Circuit component does not exist"}
        root.getJSONArray("networks").getJSONObject(0).put("components",remaining)
    }
    fun inventOhmicDevice(source:String,name:String,description:String,
        assumedOhms:Double?=null,id:String=UUID.randomUUID().toString()):String=edit(source){root->
        require(name.isNotBlank()&&name.length<=120&&description.isNotBlank()&&description.length<=500)
        require(assumedOhms==null||assumedOhms.isFinite()&&assumedOhms in 0.01..1e9){
            "Assumed equivalent resistance must be a positive finite number"
        }
        val network=root.getJSONArray("networks").getJSONObject(0)
        val components=network.getJSONArray("components")
        require(components.length()<48){"Circuit is at its component limit"}
        val sourcePart=(0 until components.length()).map{components.getJSONObject(it)}
            .firstOrNull{it.getString("kind")=="dc-source"}
            ?:error("Wire an electrical source before inventing a device")
        val device=JSONObject().put("id",id).put("kind","hypothetical-device")
            .put("name",name).put("assumption",description)
            .put("evidence","hypothetical-user-assumed")
            .put("positiveNodeId",sourcePart.getString("positiveNodeId"))
            .put("negativeNodeId",sourcePart.getString("negativeNodeId"))
        if(assumedOhms!=null)device.put("assumedResistanceOhm",assumedOhms)
        components.put(device)
    }
    fun addSolid(source: String,shape: String,id: String=UUID.randomUUID().toString()): String =
        edit(source){project->
            require(shape in setOf("box","sphere","cylinder")){"Unsupported solid type"}
            val array=project.getJSONArray("entities")
            require(array.length()<200){"Only 200 solids can be stored in a portable project."}
            require((0 until array.length()).none {array.getJSONObject(it).getString("id")==id}){"Duplicate solid ID"}
            array.put(JSONObject()
                .put("id",id).put("name",when(shape){"box"->"Cube";"sphere"->"Sphere";else->"Cylinder"})
                .put("shape",shape)
                .put("positionMeters",JSONArray(listOf(0,0.5,0)))
                .put("dimensionsMeters",JSONArray(listOf(1,1,1)))
                .put("color","#A4C9C6")
                .put("materialId",JSONObject.NULL)
                .put("scientificRole","visual-only")
                .put("opacity",1.0))
        }
    fun addHypotheticalMaterial(
        source:String,name:String,densityKgM3:Double?,youngModulusPa:Double?=null,
        id:String=UUID.randomUUID().toString()
    ):String = edit(source){project->
        require(name.isNotBlank() && name.length<=120){"Hypothetical material needs a name."}
        require(densityKgM3==null || densityKgM3.isFinite() && densityKgM3 in 0.001..1e9){
            "Assumed density is outside the supported finite domain."
        }
        require(youngModulusPa==null || youngModulusPa.isFinite() && youngModulusPa in 0.0..1e15){
            "Assumed modulus is outside the supported finite domain."
        }
        val array=project.getJSONArray("materials")
        require(array.length()<100){"Only 100 materials can be stored."}
        require((0 until array.length()).none {array.getJSONObject(it).getString("id")==id}){"Duplicate material ID"}
        array.put(JSONObject().put("id",id).put("name",name)
            .put("densityKgM3",densityKgM3?:JSONObject.NULL)
            .put("youngModulusPa",youngModulusPa?:JSONObject.NULL)
            .put("evidence","hypothetical-user-assumed"))
    }
    fun renameSolid(source:String,id:String,newName:String):String =
        edit(source){project->
            val arr=project.getJSONArray("entities")
            val found=(0 until arr.length()).firstOrNull{arr.getJSONObject(it).getString("id")==id}
                ?:error("This solid was not found.")
            arr.getJSONObject(found).put("name",newName)
        }
    fun resizeSolid(source:String,id:String,dimensions:List<Double>):String =
        edit(source){project->
            val arr=project.getJSONArray("entities")
            val found=(0 until arr.length()).firstOrNull{arr.getJSONObject(it).getString("id")==id}
                ?:error("This solid was not found.")
            arr.getJSONObject(found).put("dimensionsMeters",JSONArray(dimensions))
        }

    fun positionSolid(source:String,id:String,positionMeters:List<Double>):String =
        edit(source){project->
            require(positionMeters.size==3 && positionMeters.all{
                it.isFinite() && it in -100000.0..100000.0
            }){"Position needs three bounded SI coordinates"}
            val arr=project.getJSONArray("entities")
            val index=(0 until arr.length()).firstOrNull{
                arr.getJSONObject(it).getString("id")==id
            }?:error("Selected invention no longer exists")
            arr.getJSONObject(index).put("positionMeters",JSONArray(positionMeters))
        }
    fun snapSolid(source:String,id:String,gridMeters:Double):String {
        require(gridMeters.isFinite() && gridMeters in 0.001..100.0) {
            "Grid spacing must be 0.001 to 100 metres"
        }
        val p=NativeWorldLabProjectCodec.decode(source)
        val solid=p.entities.firstOrNull{it.id==id}?:error("Selected invention is missing")
        val position=listOf(
            solid.positionMeters.x,solid.positionMeters.y,solid.positionMeters.z
        ).map{value->
            val snapped=kotlin.math.round(value/gridMeters)*gridMeters
            val rounded=kotlin.math.round(snapped*1e6)/1e6
            require(rounded.isFinite() && rounded in -100000.0..100000.0){
                "Snapped coordinate is outside the local world"
            }
            rounded
        }
        return positionSolid(source,id,position)
    }
    data class GeometryMeasurement(
        val fromId:String,val toId:String,
        val offsetXM:Double,val offsetYM:Double,val offsetZM:Double,
        val centerDistanceM:Double,val horizontalDistanceM:Double
    )
    fun measureCenters(p:NativeWorldLabProject,fromId:String,toId:String):GeometryMeasurement {
        require(fromId!=toId){"Choose two distinct solids for measurement"}
        val a=p.entities.firstOrNull{it.id==fromId}?:error("Starting solid is missing")
        val b=p.entities.firstOrNull{it.id==toId}?:error("Target solid is missing")
        val dx=b.positionMeters.x-a.positionMeters.x
        val dy=b.positionMeters.y-a.positionMeters.y
        val dz=b.positionMeters.z-a.positionMeters.z
        val horizontal=kotlin.math.hypot(dx,dz)
        val threeDimensional=kotlin.math.hypot(horizontal,dy)
        require(horizontal.isFinite()&&threeDimensional.isFinite()) {
            "Geometric distance exceeds the supported numeric range"
        }
        return GeometryMeasurement(fromId,toId,dx,dy,dz,threeDimensional,horizontal)
    }
    fun assignMaterial(source:String,solidId:String,materialId:String?):String =
        edit(source){project->
            val arr=project.getJSONArray("entities")
            val found=(0 until arr.length()).firstOrNull{arr.getJSONObject(it).getString("id")==solidId}
                ?:error("This solid was not found.")
            arr.getJSONObject(found).put("materialId",materialId?:JSONObject.NULL)
        }
}

/** Revision-monotonic 50-edit undo/redo for native unsaved World Lab authoring. */
class NativeWorldLabEditHistory {
    private val past=java.util.ArrayDeque<String>()
    private val future=java.util.ArrayDeque<String>()
    val canUndo:Boolean get()=past.isNotEmpty()
    val canRedo:Boolean get()=future.isNotEmpty()
    fun clear(){past.clear();future.clear()}
    fun record(before:String,after:String){
        val old=NativeWorldLabProjectCodec.decode(before)
        val next=NativeWorldLabProjectCodec.decode(after)
        require(old.id==next.id && old.schemaVersion==next.schemaVersion &&
            next.revision>old.revision){"History edits require one advancing project"}
        past.addLast(before)
        while(past.size>50)past.removeFirst()
        future.clear()
    }
    private fun restore(snapshot:String,current:String):String{
        val target=NativeWorldLabProjectCodec.decode(snapshot)
        val active=NativeWorldLabProjectCodec.decode(current)
        require(target.id==active.id && target.schemaVersion==active.schemaVersion){
            "Undo cannot restore another project"
        }
        require(active.revision<1_000_000_000){"Project revision capacity reached"}
        val root=JSONObject(snapshot)
        root.put("revision",active.revision+1)
        root.put("updatedAt",Instant.now().toString())
        val json=root.toString()
        NativeWorldLabProjectCodec.decode(json)
        return json
    }
    fun undo(current:String):String?{
        val snapshot=past.peekLast()?:return null
        val next=restore(snapshot,current)
        past.removeLast();future.addFirst(current)
        while(future.size>50)future.removeLast()
        return next
    }
    fun redo(current:String):String?{
        val snapshot=future.peekFirst()?:return null
        val next=restore(snapshot,current)
        future.removeFirst();past.addLast(current)
        while(past.size>50)past.removeFirst()
        return next
    }
}


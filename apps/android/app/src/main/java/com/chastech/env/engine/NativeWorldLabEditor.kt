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
                .put("terrainSource",JSONObject.NULL)
                .put("geodeticOrigin",JSONObject.NULL))
            .put("camera",JSONObject()
                .put("positionMeters",JSONArray(listOf(0,1.65,-8)))
                .put("lookingAtMeters",JSONArray(listOf(0,1.2,0))))
            .put("entities",JSONArray())
            .put("materials",JSONArray())
            .put("networks",JSONArray())
            .put("assemblies",JSONArray())
            .put("digitalNetworks",JSONArray())
        val json=project.toString()
        NativeWorldLabProjectCodec.decode(json)
        return json
    }
    fun startDigitalInvention(source:String,
        id:String=UUID.randomUUID().toString()):String=edit(source){p->
        val list=p.optJSONArray("digitalNetworks")?:JSONArray().also{p.put("digitalNetworks",it)}
        require(list.length()<8){"Maximum eight digital inventions"}
        list.put(JSONObject().put("id",id).put("name","My invented logic")
            .put("inputs",JSONArray()
                .put(JSONObject().put("id","input_a").put("label","Switch A").put("value",false))
                .put(JSONObject().put("id","input_b").put("label","Switch B").put("value",false)))
            .put("gates",JSONArray().put(JSONObject()
                .put("id","invented_gate").put("name","Invented NAND")
                .put("assumption","User-assumed NAND behavior")
                .put("evidence","hypothetical-user-assumed")
                .put("inputNodeIds",JSONArray(listOf("input_a","input_b")))
                .put("truthTable",JSONArray(listOf(1,1,1,0)))))
            .put("outputs",JSONArray().put(JSONObject()
                .put("id","output_q").put("label","Indicator")
                .put("sourceNodeId","invented_gate"))))
    }
    fun digitalSwitch(source:String,networkId:String,inputId:String,value:Boolean):String=
        edit(source){p->
            val nets=p.getJSONArray("digitalNetworks")
            val n=(0 until nets.length()).map{nets.getJSONObject(it)}
                .firstOrNull{it.getString("id")==networkId}?:error("Unknown digital network")
            val inputs=n.getJSONArray("inputs")
            val input=(0 until inputs.length()).map{inputs.getJSONObject(it)}
                .firstOrNull{it.getString("id")==inputId}?:error("Unknown digital input")
            input.put("value",value)
        }
    fun digitalTruthBit(source:String,networkId:String,gateId:String,
        row:Int,bit:Int):String=edit(source){p->
        require(bit in 0..1){"Digital output must be zero or one"}
        val nets=p.getJSONArray("digitalNetworks")
        val n=(0 until nets.length()).map{nets.getJSONObject(it)}
            .firstOrNull{it.getString("id")==networkId}?:error("Unknown digital network")
        val gs=n.getJSONArray("gates")
        val g=(0 until gs.length()).map{gs.getJSONObject(it)}
            .firstOrNull{it.getString("id")==gateId}?:error("Unknown digital gate")
        val table=g.getJSONArray("truthTable")
        require(row in 0 until table.length()){"Digital row is outside truth table"}
        table.put(row,bit)
    }
    /** Add a user-defined Boolean gate after its input nodes, preserving an acyclic graph. */
    fun addDigitalGate(source:String,networkId:String,name:String,assumption:String,
        inputNodeIds:List<String>,id:String=UUID.randomUUID().toString()):String=
        edit(source){p->
            require(name.isNotBlank()&&name.length<=120&&
                assumption.isNotBlank()&&assumption.length<=500){
                "Digital invention requires a bounded name and assumption"
            }
            require(inputNodeIds.size in 1..4&&inputNodeIds.distinct().size==inputNodeIds.size){
                "Digital invention requires one to four distinct upstream nodes"
            }
            val nets=p.getJSONArray("digitalNetworks")
            val n=(0 until nets.length()).map{nets.getJSONObject(it)}
                .firstOrNull{it.getString("id")==networkId}?:error("Unknown digital network")
            val inputs=n.getJSONArray("inputs")
            val gates=n.getJSONArray("gates")
            val outputs=n.getJSONArray("outputs")
            require(gates.length()<32){"Digital gate limit reached"}
            val preceding=(0 until inputs.length()).map{inputs.getJSONObject(it).getString("id")}+
                (0 until gates.length()).map{gates.getJSONObject(it).getString("id")}
            require(inputNodeIds.all{it in preceding}){"Digital ports must connect upstream"}
            val allIds=preceding+
                (0 until outputs.length()).map{outputs.getJSONObject(it).getString("id")}
            require(id !in allIds){"Duplicate digital node"}
            val truth=JSONArray()
            repeat(1 shl inputNodeIds.size){truth.put(0)}
            gates.put(JSONObject().put("id",id).put("name",name.trim())
                .put("assumption",assumption.trim())
                .put("evidence","hypothetical-user-assumed")
                .put("inputNodeIds",JSONArray(inputNodeIds)).put("truthTable",truth))
        }
    /** Attach the indicator to a valid upstream node without altering any gate assumption. */
    fun digitalOutputSource(source:String,networkId:String,outputId:String,
        sourceNodeId:String):String=edit(source){p->
        val nets=p.getJSONArray("digitalNetworks")
        val network=(0 until nets.length()).map{nets.getJSONObject(it)}
            .firstOrNull{it.getString("id")==networkId}?:error("Unknown digital network")
        val inputs=network.getJSONArray("inputs")
        val gates=network.getJSONArray("gates")
        val known=(0 until inputs.length()).map{inputs.getJSONObject(it).getString("id")}+
            (0 until gates.length()).map{gates.getJSONObject(it).getString("id")}
        require(sourceNodeId in known){"Digital output must read an existing switch or gate"}
        val outputs=network.getJSONArray("outputs")
        val output=(0 until outputs.length()).map{outputs.getJSONObject(it)}
            .firstOrNull{it.getString("id")==outputId}?:error("Unknown digital output")
        output.put("sourceNodeId",sourceNodeId)
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

    fun createVisualAssembly(source:String,name:String,ids:List<String>,
        id:String=UUID.randomUUID().toString()):String=edit(source){root->
        require(name.isNotBlank()&&name.length<=120&&ids.size in 2..30){
            "An assembly needs a name and two to thirty solids"
        }
        val groups=root.optJSONArray("assemblies")?:JSONArray().also{root.put("assemblies",it)}
        require(groups.length()<50){"Maximum fifty visual assemblies per project"}
        val members=JSONArray()
        ids.forEach{members.put(it)}
        groups.put(JSONObject().put("id",id).put("name",name.trim()).put("entityIds",members))
    }
    fun moveVisualAssembly(source:String,id:String,delta:List<Double>):String=edit(source){root->
        require(delta.size==3&&delta.all{it.isFinite()&&it in -1000.0..1000.0}){
            "Assembly movement needs bounded SI offsets"
        }
        val groups=root.getJSONArray("assemblies")
        val group=(0 until groups.length()).map{groups.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Visual assembly not found")
        val ids=group.getJSONArray("entityIds")
        val members=(0 until ids.length()).map{ids.getString(it)}.toSet()
        val solids=root.getJSONArray("entities")
        for(i in 0 until solids.length()){
            val solid=solids.getJSONObject(i)
            if(solid.getString("id") !in members)continue
            val position=solid.getJSONArray("positionMeters")
            val moved=JSONArray()
            for(axis in 0..2){
                val value=kotlin.math.round((position.getDouble(axis)+delta[axis])*1e6)/1e6
                require(value.isFinite()&&value in -100000.0..100000.0){
                    "Assembly moved beyond the portable world boundary"
                }
                moved.put(value)
            }
            solid.put("positionMeters",moved)
        }
    }
    fun ungroupVisualAssembly(source:String,id:String):String=edit(source){root->
        val groups=root.getJSONArray("assemblies")
        val remaining=JSONArray()
        var found=false
        for(i in 0 until groups.length()){
            val group=groups.getJSONObject(i)
            if(group.getString("id")==id)found=true else remaining.put(group)
        }
        require(found){"This visual assembly is missing"}
        root.put("assemblies",remaining)
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
                .put("rotationRadians",JSONArray(listOf(0.0,0.0,0.0)))
                .put("color","#A4C9C6")
                .put("materialId",JSONObject.NULL)
                .put("scientificRole","visual-only")
                .put("opacity",1.0))
        }
    fun rotateSolid(source:String,id:String,axis:Int,deltaDegrees:Double):String=edit(source){project->
        require(axis in 0..2&&deltaDegrees.isFinite()&&deltaDegrees in -3600.0..3600.0){
            "Rotation requires an X/Y/Z axis and a finite angle within ±3600 degrees"
        }
        val entities=project.getJSONArray("entities")
        val solid=(0 until entities.length()).map{entities.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Selected solid no longer exists")
        val values=if(solid.has("rotationRadians"))solid.getJSONArray("rotationRadians")
            else JSONArray(listOf(0.0,0.0,0.0))
        require(values.length()==3){"Stored rotation must contain three angles"}
        val old=values.getDouble(axis)
        require(old.isFinite()&&old in -Math.PI*2..Math.PI*2){"Stored rotation is invalid"}
        val raw=old+deltaDegrees*Math.PI/180.0
        val normalized=((raw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI
        values.put(axis,if(kotlin.math.abs(normalized)<1e-12)0.0 else normalized)
        solid.put("rotationRadians",values)
    }
    fun scaleSolid(source:String,id:String,factors:List<Double>):String{
        require(factors.size==3&&factors.all{it.isFinite()&&it in 0.001..1000.0}){
            "Scale factors must be three positive bounded values"
        }
        val p=NativeWorldLabProjectCodec.decode(source)
        val solid=p.entities.firstOrNull{it.id==id}?:error("Selected solid no longer exists")
        val old=listOf(solid.dimensionsMeters.x,solid.dimensionsMeters.y,solid.dimensionsMeters.z)
        val dims=when(solid.shape){
            "sphere"->List(3){old[0]*factors[0]}
            "cylinder"->{val radial=kotlin.math.sqrt(factors[0]*factors[2]);listOf(old[0]*radial,old[1]*factors[1],old[2]*radial)}
            else->old.indices.map{old[it]*factors[it]}
        }
        require(dims.all{it.isFinite()&&it in 0.001..10000.0}){"Scaled geometry exceeds model bounds"}
        return resizeSolid(source,id,dims)
    }
    fun duplicateSolid(source:String,id:String,offsetMeters:List<Double>,
        newId:String=UUID.randomUUID().toString()):String=edit(source){project->
        require(offsetMeters.size==3&&offsetMeters.all{it.isFinite()&&it in -100000.0..100000.0}){"Duplicate offset is invalid"}
        val entities=project.getJSONArray("entities")
        require(entities.length()<200){"Duplicate would exceed the 200-solid project limit"}
        require(newId.matches(Regex("[A-Za-z0-9_-]{1,120}"))&&
            (0 until entities.length()).none{entities.getJSONObject(it).getString("id")==newId}){"Duplicate solid identity is invalid"}
        val original=(0 until entities.length()).map{entities.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Source solid no longer exists")
        val clone=JSONObject(original.toString())
        val position=clone.getJSONArray("positionMeters")
        for(i in 0..2){val next=position.getDouble(i)+offsetMeters[i];require(next.isFinite()&&next in -100000.0..100000.0);position.put(i,next)}
        clone.put("id",newId).put("name",(original.getString("name")+" copy").take(120))
        if(!clone.has("rotationRadians"))clone.put("rotationRadians",JSONArray(listOf(0.0,0.0,0.0)))
        entities.put(clone)
    }
    fun linearPattern(source:String,id:String,axis:Int,spacingMeters:Double,copies:Int):String=edit(source){project->
        require(axis in 0..2&&spacingMeters.isFinite()&&spacingMeters in -100000.0..100000.0&&spacingMeters!=0.0&&copies in 1..50){
            "Linear pattern requires an axis, non-zero spacing and 1–50 copies"
        }
        val entities=project.getJSONArray("entities")
        val original=(0 until entities.length()).map{entities.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Pattern source no longer exists")
        require(entities.length()+copies<=200){"Linear pattern exceeds the 200-solid project limit"}
        for(n in 1..copies){
            val clone=JSONObject(original.toString())
            val pos=clone.getJSONArray("positionMeters")
            val value=pos.getDouble(axis)+spacingMeters*n
            require(value.isFinite()&&value in -100000.0..100000.0){"Pattern position exceeds local-world bounds"}
            pos.put(axis,value)
            clone.put("id",UUID.randomUUID().toString())
                .put("name",(original.getString("name")+" "+(n+1)).take(120))
            if(!clone.has("rotationRadians"))clone.put("rotationRadians",JSONArray(listOf(0.0,0.0,0.0)))
            entities.put(clone)
        }
    }
    fun setGeodeticOrigin(source:String,origin:NativeGeodetic?):String=edit(source){project->
        val world=project.getJSONObject("world")
        if(origin==null)world.put("geodeticOrigin",JSONObject.NULL) else {
            val valid=NativeWorldLabGeodesy.validate(origin)
            world.put("geodeticOrigin",JSONObject().put("latitudeDegrees",valid.latitudeDegrees)
                .put("longitudeDegrees",valid.longitudeDegrees).put("heightMeters",valid.heightMeters))
        }
    }
    fun saveCameraViewpoint(source:String,position:List<Double>,target:List<Double>):String=edit(source){project->
        require(position.size==3&&target.size==3&&
            (position+target).all{it.isFinite()&&it in -100000.0..100000.0}){
            "Camera viewpoint needs six finite bounded world coordinates"
        }
        val camera=project.getJSONObject("camera")
        camera.put("positionMeters",JSONArray(position))
        camera.put("lookingAtMeters",JSONArray(target))
    }
    private fun rotationMatrix(angles:List<Double>):Array<DoubleArray>{
        require(angles.size==3&&angles.all{it.isFinite()}){"Invalid rotation"}
        val (x,y,z)=angles
        val cx=kotlin.math.cos(x);val sx=kotlin.math.sin(x)
        val cy=kotlin.math.cos(y);val sy=kotlin.math.sin(y)
        val cz=kotlin.math.cos(z);val sz=kotlin.math.sin(z)
        return arrayOf(
            doubleArrayOf(cy*cz+sy*sx*sz,-cy*sz+sy*sx*cz,sy*cx),
            doubleArrayOf(cx*sz,cx*cz,-sx),
            doubleArrayOf(-sy*cz+cy*sx*sz,sy*sz+cy*sx*cz,cy*cx))
    }
    private fun matrixAngles(m:Array<DoubleArray>):List<Double>{
        val x=kotlin.math.asin((-m[1][2]).coerceIn(-1.0,1.0))
        val cx=kotlin.math.cos(x)
        val y:Double;val z:Double
        if(kotlin.math.abs(cx)>1e-8){y=kotlin.math.atan2(m[0][2],m[2][2]);z=kotlin.math.atan2(m[1][0],m[1][1])}
        else {y=kotlin.math.atan2(-m[2][0],m[0][0]);z=0.0}
        fun wrap(a:Double):Double{val v=((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return if(kotlin.math.abs(v)<1e-12)0.0 else v}
        return listOf(wrap(x),wrap(y),wrap(z))
    }
    private fun multiplyRotation(a:Array<DoubleArray>,b:Array<DoubleArray>)=
        Array(3){row->DoubleArray(3){col->(0..2).sumOf{k->a[row][k]*b[k][col]}}}

    private data class NativeCadBounds(
        val center:List<Double>,val half:List<Double>,
        val min:List<Double>,val max:List<Double>
    )
    private fun cadBounds(entity:JSONObject):NativeCadBounds {
        val position=entity.getJSONArray("positionMeters")
        val dims=entity.getJSONArray("dimensionsMeters")
        val angles=if(entity.has("rotationRadians"))
            (0..2).map{entity.getJSONArray("rotationRadians").getDouble(it)}
            else listOf(0.0,0.0,0.0)
        val matrix=rotationMatrix(angles)
        val half=(0..2).map{axis->
            (0..2).sumOf{local->kotlin.math.abs(matrix[axis][local])*dims.getDouble(local)/2}
        }
        val center=(0..2).map{position.getDouble(it)}
        return NativeCadBounds(center,half,
            (0..2).map{center[it]-half[it]},(0..2).map{center[it]+half[it]})
    }
    private fun selectedCadRows(project:JSONObject,ids:List<String>):Pair<JSONArray,List<JSONObject>> {
        require(ids.isNotEmpty()&&ids.distinct().size==ids.size){
            "Select one or more distinct parts"
        }
        val rows=project.getJSONArray("entities")
        val lookup=(0 until rows.length()).map{rows.getJSONObject(it)}
            .associateBy{it.getString("id")}
        require(ids.all{lookup.containsKey(it)}){
            "A selected part no longer exists in this invention"
        }
        return rows to ids.map{lookup.getValue(it)}
    }
    fun rotateSolids(source:String,ids:List<String>,axis:Int,degrees:Double):String=edit(source){project->
        require(axis in 0..2&&degrees.isFinite()&&degrees in -3600.0..3600.0){
            "Multi-part rotation needs an X/Y/Z axis and bounded finite degrees"
        }
        val (_,selected)=selectedCadRows(project,ids)
        selected.forEach{solid->
            val values=if(solid.has("rotationRadians"))solid.getJSONArray("rotationRadians")
                else JSONArray(listOf(0.0,0.0,0.0))
            val raw=values.getDouble(axis)+degrees*Math.PI/180.0
            val wrapped=((raw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI
            values.put(axis,if(kotlin.math.abs(wrapped)<1e-12)0.0 else wrapped)
            solid.put("rotationRadians",values)
        }
    }
    fun scaleSolids(source:String,ids:List<String>,factors:List<Double>):String=edit(source){project->
        require(factors.size==3&&factors.all{it.isFinite()&&it in 0.001..1000.0}){
            "Multi-part scale requires three positive bounded factors"
        }
        val (_,selected)=selectedCadRows(project,ids)
        selected.forEach{solid->
            val old=solid.getJSONArray("dimensionsMeters")
            val values=(0..2).map{old.getDouble(it)}
            val next=when(solid.getString("shape")){
                "sphere"->List(3){values[0]*factors[0]}
                "cylinder"->{val radial=kotlin.math.sqrt(factors[0]*factors[2])
                    listOf(values[0]*radial,values[1]*factors[1],values[2]*radial)}
                else->values.indices.map{values[it]*factors[it]}
            }
            require(next.all{it.isFinite()&&it in 0.001..10000.0}){
                "Scaling selected parts would exceed portable geometry bounds"
            }
            solid.put("dimensionsMeters",JSONArray(next))
        }
    }
    fun duplicateSolids(source:String,ids:List<String>,offsetMeters:List<Double>):String=edit(source){project->
        require(offsetMeters.size==3&&offsetMeters.all{it.isFinite()&&it in -100000.0..100000.0}){
            "Multi-part duplicate offset is outside the local world"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        require(rows.length()+selected.size<=200){
            "Duplicating this selection would exceed the 200-part limit"
        }
        val used=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}.toMutableSet()
        selected.forEach{original->
            val clone=JSONObject(original.toString())
            var newId=UUID.randomUUID().toString()
            while(newId in used)newId=UUID.randomUUID().toString()
            used.add(newId)
            val pos=clone.getJSONArray("positionMeters")
            for(axis in 0..2){
                val value=pos.getDouble(axis)+offsetMeters[axis]
                require(value.isFinite()&&value in -100000.0..100000.0){
                    "A duplicate part would leave the local world"
                }
                pos.put(axis,value)
            }
            clone.put("id",newId)
                .put("name",(original.getString("name")+" copy").take(120))
            rows.put(clone)
        }
    }
    fun alignSolids(source:String,ids:List<String>,axis:Int,alignment:String):String=edit(source){project->
        require(axis in 0..2&&alignment in setOf("min","center","max")){
            "Alignment needs an X/Y/Z axis and min, center or max"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        require(selected.size>=2){"Alignment needs at least two parts"}
        val bounds=selected.associate{it.getString("id") to cadBounds(it)}
        val target=when(alignment){
            "min"->bounds.values.minOf{it.min[axis]}
            "max"->bounds.values.maxOf{it.max[axis]}
            else->bounds.values.map{it.center[axis]}.average()
        }
        for(index in 0 until rows.length()){
            val row=rows.getJSONObject(index);val box=bounds[row.getString("id")]?:continue
            val position=row.getJSONArray("positionMeters")
            val value=when(alignment){
                "min"->target+box.half[axis]
                "max"->target-box.half[axis]
                else->target
            }
            require(value.isFinite()&&value in -100000.0..100000.0){
                "Alignment exceeds the portable coordinate envelope"
            }
            position.put(axis,value)
        }
    }
    fun distributeSolids(source:String,ids:List<String>,axis:Int,gapMeters:Double):String=edit(source){project->
        require(axis in 0..2&&gapMeters.isFinite()&&gapMeters in 0.0..100000.0){
            "Distribution requires an axis and nonnegative bounded gap"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        require(selected.size>=3){"Distribution needs at least three parts"}
        val bounds=selected.map{it to cadBounds(it)}.sortedBy{it.second.center[axis]}
        val target=mutableMapOf<String,Double>()
        var cursor=bounds.first().second.max[axis]
        for((entity,box) in bounds.drop(1)){
            val center=cursor+gapMeters+box.half[axis]
            require(center.isFinite()&&center in -100000.0..100000.0){
                "Distribution exceeds the portable coordinate envelope"
            }
            target[entity.getString("id")]=center
            cursor=center+box.half[axis]
        }
        for(index in 0 until rows.length()){
            val row=rows.getJSONObject(index);val value=target[row.getString("id")]?:continue
            row.getJSONArray("positionMeters").put(axis,value)
        }
    }




    fun rotateGroupAroundCentroid(source:String,ids:List<String>,
        axis:Int,degrees:Double):String=edit(source){project->
        require(axis in 0..2&&degrees.isFinite()&&degrees in -3600.0..3600.0){
            "Group rotation requires an axis and bounded finite angle"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        val pivot=(0..2).map{coordinate->selected.map{
            it.getJSONArray("positionMeters").getDouble(coordinate)
        }.average()}
        val angles=List(3){if(it==axis)degrees*Math.PI/180.0 else 0.0}
        val rotation=rotationMatrix(angles)
        val rotations=selected.associate{part->
            val local=if(part.has("rotationRadians"))
                (0..2).map{part.getJSONArray("rotationRadians").getDouble(it)}
                else listOf(0.0,0.0,0.0)
            part.getString("id") to multiplyRotation(rotation,rotationMatrix(local))
        }
        val positions=selected.associate{part->
            val old=(0..2).map{part.getJSONArray("positionMeters").getDouble(it)}
            val relative=(0..2).map{old[it]-pivot[it]}
            val next=(0..2).map{axisIndex->
                pivot[axisIndex]+(0..2).sumOf{rotation[axisIndex][it]*relative[it]}
            }
            require(next.all{it.isFinite()&&it in -100000.0..100000.0}){
                "Group rotation leaves portable world bounds"
            }
            part.getString("id") to next
        }
        for(index in 0 until rows.length()){
            val row=rows.getJSONObject(index);val id=row.getString("id")
            val position=positions[id]?:continue
            row.put("positionMeters",JSONArray(position))
                .put("rotationRadians",JSONArray(matrixAngles(rotations.getValue(id))))
        }
    }
    fun scaleGroupAroundCentroid(source:String,ids:List<String>,factor:Double):String=edit(source){project->
        require(factor.isFinite()&&factor in 0.001..1000.0){
            "Group scale must be a finite positive factor between 0.001 and 1000"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        val pivot=(0..2).map{coordinate->selected.map{
            it.getJSONArray("positionMeters").getDouble(coordinate)
        }.average()}
        val positions=selected.associate{part->
            val p=part.getJSONArray("positionMeters")
            val next=(0..2).map{pivot[it]+(p.getDouble(it)-pivot[it])*factor}
            require(next.all{it.isFinite()&&it in -100000.0..100000.0}){
                "Group scale moves part outside portable world bounds"
            }
            part.getString("id") to next
        }
        val dimensions=selected.associate{part->
            val d=part.getJSONArray("dimensionsMeters")
            val next=(0..2).map{d.getDouble(it)*factor}
            require(next.all{it.isFinite()&&it in 0.001..10000.0}){
                "Group scale exceeds primitive dimension bounds"
            }
            part.getString("id") to next
        }
        for(index in 0 until rows.length()){
            val row=rows.getJSONObject(index);val id=row.getString("id")
            val position=positions[id]?:continue
            row.put("positionMeters",JSONArray(position))
                .put("dimensionsMeters",JSONArray(dimensions.getValue(id)))
        }
    }

    fun translateSolids(source:String,ids:List<String>,deltaMeters:List<Double>):String=edit(source){project->
        require(deltaMeters.size==3&&deltaMeters.all{it.isFinite()&&it in -100000.0..100000.0}){
            "Translation needs three finite bounded SI offsets"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        val targets=selected.associate{solid->
            val old=solid.getJSONArray("positionMeters")
            val next=(0..2).map{old.getDouble(it)+deltaMeters[it]}
            require(next.all{it.isFinite()&&it in -100000.0..100000.0}){
                "A translated part would leave the local world"
            }
            solid.getString("id") to next
        }
        for(index in 0 until rows.length()){
            val row=rows.getJSONObject(index)
            val position=targets[row.getString("id")]?:continue
            row.put("positionMeters",JSONArray(position))
        }
    }
    fun mirrorSolids(source:String,ids:List<String>,axis:Int,planeMeters:Double):String=edit(source){project->
        require(axis in 0..2&&planeMeters.isFinite()&&planeMeters in -100000.0..100000.0){
            "Multi-part mirror needs a bounded X/Y/Z plane"
        }
        val (_,selected)=selectedCadRows(project,ids)
        selected.forEach{solid->
            val position=solid.getJSONArray("positionMeters")
            val coordinate=2*planeMeters-position.getDouble(axis)
            require(coordinate.isFinite()&&coordinate in -100000.0..100000.0){
                "Mirroring a selected part would leave local-world bounds"
            }
            position.put(axis,coordinate)
            val angles=if(solid.has("rotationRadians"))
                (0..2).map{solid.getJSONArray("rotationRadians").getDouble(it)}
                else listOf(0.0,0.0,0.0)
            val matrix=rotationMatrix(angles)
            val signs=listOf(1.0,1.0,1.0).toMutableList().also{it[axis]=-1.0}
            val localSigns=listOf(1.0,1.0,1.0).toMutableList().also{it[axis]=-1.0}
            val reflected=Array(3){row->DoubleArray(3){col->
                signs[row]*matrix[row][col]*localSigns[col]
            }}
            solid.put("rotationRadians",JSONArray(matrixAngles(reflected)))
        }
    }
    fun linearPatternSolids(source:String,ids:List<String>,axis:Int,
        spacingMeters:Double,copies:Int):String=edit(source){project->
        require(axis in 0..2&&spacingMeters.isFinite()&&spacingMeters in -100000.0..100000.0&&
            spacingMeters!=0.0&&copies in 1..50){
            "Multi-part linear pattern needs an axis, non-zero spacing and 1–50 copies"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        require(rows.length()+selected.size*copies<=200){
            "Multi-part linear pattern exceeds the 200-solid project limit"
        }
        val clones=mutableListOf<JSONObject>()
        val used=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}.toMutableSet()
        for(n in 1..copies)for(original in selected){
            val clone=JSONObject(original.toString())
            val position=clone.getJSONArray("positionMeters")
            val value=position.getDouble(axis)+spacingMeters*n
            require(value.isFinite()&&value in -100000.0..100000.0){
                "Linear pattern position exceeds local-world bounds"
            }
            position.put(axis,value)
            var id=UUID.randomUUID().toString()
            while(id in used)id=UUID.randomUUID().toString()
            used.add(id)
            clone.put("id",id).put("name",(original.getString("name")+" "+(n+1)).take(120))
            if(!clone.has("rotationRadians"))clone.put("rotationRadians",JSONArray(listOf(0.0,0.0,0.0)))
            clones.add(clone)
        }
        clones.forEach{rows.put(it)}
    }
    fun circularPatternSolids(source:String,ids:List<String>,axis:Int,
        centerMeters:List<Double>,instances:Int):String=edit(source){project->
        require(axis in 0..2&&centerMeters.size==3&&
            centerMeters.all{it.isFinite()&&it in -100000.0..100000.0}&&instances in 2..36){
            "Multi-part circular pattern requires an axis, bounded center and 2–36 instances"
        }
        val (rows,selected)=selectedCadRows(project,ids)
        require(rows.length()+selected.size*(instances-1)<=200){
            "Multi-part circular pattern exceeds the 200-solid project limit"
        }
        val a=axis;val b=(a+1)%3;val c=(a+2)%3
        val clones=mutableListOf<JSONObject>()
        val used=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}.toMutableSet()
        for(n in 1 until instances){
            val angle=2*Math.PI*n/instances
            val co=kotlin.math.cos(angle);val si=kotlin.math.sin(angle)
            for(original in selected){
                val position=original.getJSONArray("positionMeters")
                val next=(0..2).map{position.getDouble(it)}.toMutableList()
                val u=position.getDouble(b)-centerMeters[b]
                val v=position.getDouble(c)-centerMeters[c]
                next[b]=centerMeters[b]+u*co-v*si
                next[c]=centerMeters[c]+u*si+v*co
                require(next.all{it.isFinite()&&it in -100000.0..100000.0}){
                    "Multi-part circular pattern position overflow"
                }
                val angles=if(original.has("rotationRadians"))
                    (0..2).map{original.getJSONArray("rotationRadians").getDouble(it)}
                    else listOf(0.0,0.0,0.0)
                val sourceRotation=rotationMatrix(angles)
                val world=Array(3){row->DoubleArray(3){0.0}}
                world[a][a]=1.0;world[b][b]=co;world[b][c]=-si
                world[c][b]=si;world[c][c]=co
                val clone=JSONObject(original.toString())
                var id=UUID.randomUUID().toString()
                while(id in used)id=UUID.randomUUID().toString()
                used.add(id)
                clone.put("id",id).put("name",(original.getString("name")+" "+(n+1)).take(120))
                    .put("positionMeters",JSONArray(next))
                    .put("rotationRadians",JSONArray(matrixAngles(multiplyRotation(world,sourceRotation))))
                clones.add(clone)
            }
        }
        clones.forEach{rows.put(it)}
    }

    fun mirrorSolid(source:String,id:String,axis:Int,planeMeters:Double):String=edit(source){project->
        require(axis in 0..2&&planeMeters.isFinite()&&planeMeters in -100000.0..100000.0){
            "Mirror requires an X/Y/Z plane inside local-world bounds"
        }
        val entities=project.getJSONArray("entities")
        val solid=(0 until entities.length()).map{entities.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Selected solid no longer exists")
        val p=solid.getJSONArray("positionMeters")
        val coordinate=2*planeMeters-p.getDouble(axis)
        require(coordinate.isFinite()&&coordinate in -100000.0..100000.0){"Mirrored position exceeds local-world bounds"}
        p.put(axis,coordinate)
        val r=rotationMatrix(if(solid.has("rotationRadians"))(0..2).map{solid.getJSONArray("rotationRadians").getDouble(it)} else listOf(0.0,0.0,0.0))
        val signs=listOf(1.0,1.0,1.0).toMutableList();signs[axis]=-1.0
        val localSigns=listOf(1.0,1.0,1.0).toMutableList().also{it[axis]=-1.0}
        val reflected=Array(3){row->DoubleArray(3){col->signs[row]*r[row][col]*localSigns[col]}}
        solid.put("rotationRadians",JSONArray(matrixAngles(reflected)))
    }
    fun circularPattern(source:String,id:String,axis:Int,centerMeters:List<Double>,
        instances:Int):String=edit(source){project->
        require(axis in 0..2&&centerMeters.size==3&&centerMeters.all{it.isFinite()&&it in -100000.0..100000.0}&&instances in 2..36){
            "Circular pattern requires a valid axis, center and 2–36 total instances"
        }
        val entities=project.getJSONArray("entities")
        val original=(0 until entities.length()).map{entities.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}?:error("Pattern source no longer exists")
        require(entities.length()+instances-1<=200){"Circular pattern exceeds the 200-solid project limit"}
        val a=axis;val b=(a+1)%3;val c=(a+2)%3
        val position=original.getJSONArray("positionMeters")
        val sourceRotation=rotationMatrix(if(original.has("rotationRadians"))(0..2).map{original.getJSONArray("rotationRadians").getDouble(it)} else listOf(0.0,0.0,0.0))
        for(n in 1 until instances){
            val angle=2*Math.PI*n/instances
            val co=kotlin.math.cos(angle);val si=kotlin.math.sin(angle)
            val clone=JSONObject(original.toString())
            val next=(0..2).map{position.getDouble(it)}
            val u=next[b]-centerMeters[b];val v=next[c]-centerMeters[c]
            val shifted=next.toMutableList()
            shifted[b]=centerMeters[b]+u*co-v*si
            shifted[c]=centerMeters[c]+u*si+v*co
            require(shifted.all{it.isFinite()&&it in -100000.0..100000.0}){"Circular-pattern coordinate overflow"}
            clone.put("id",UUID.randomUUID().toString())
                .put("name",(original.getString("name")+" "+(n+1)).take(120))
                .put("positionMeters",JSONArray(shifted))
            val world=Array(3){row->DoubleArray(3){col->
                if(row==col&&row==axis)1.0 else if(row==axis||col==axis)0.0 else 0.0
            }}
            world[ b ][ b ]=co;world[b][c]=-si;world[c][b]=si;world[c][c]=co
            clone.put("rotationRadians",JSONArray(matrixAngles(multiplyRotation(world,sourceRotation))))
            entities.put(clone)
        }
    }
    fun extrudeRectangle(source:String,widthMeters:Double,depthMeters:Double,
        heightMeters:Double,id:String=UUID.randomUUID().toString(),
        centerMeters:List<Double> = listOf(0.0,0.0,0.0),
        rotationRadians:List<Double> = listOf(0.0,0.0,0.0)):String=edit(source){project->
        require(listOf(widthMeters,depthMeters,heightMeters).all{it.isFinite()&&it in 0.001..10000.0}){
            "Closed rectangular sketch needs finite positive width, depth and height"
        }
        require(centerMeters.size==3&&centerMeters.all{it.isFinite()&&it in -100000.0..100000.0}&&
            rotationRadians.size==3&&rotationRadians.all{it.isFinite()&&it in -2*Math.PI..2*Math.PI}){
            "Sketch placement needs three bounded SI coordinates and finite Euler angles"
        }
        val entities=project.getJSONArray("entities")
        require(entities.length()<200&&id.matches(Regex("[A-Za-z0-9_-]{1,120}"))&&
            (0 until entities.length()).none{entities.getJSONObject(it).getString("id")==id}){
            "Extruded sketch has an invalid identity or the 200-solid limit is reached"
        }
        val matrix=rotationMatrix(rotationRadians)
        val position=(0..2).map{centerMeters[it]+matrix[it][1]*heightMeters/2}
        require(position.all{it.isFinite()&&it in -100000.0..100000.0}){
            "Extruded solid centre leaves the local world"
        }
        entities.put(JSONObject().put("id",id).put("name","Extruded rectangular profile")
            .put("shape","box").put("positionMeters",JSONArray(position))
            .put("dimensionsMeters",JSONArray(listOf(widthMeters,heightMeters,depthMeters)))
            .put("rotationRadians",JSONArray(rotationRadians))
            .put("color","#A4C9C6").put("materialId",JSONObject.NULL)
            .put("scientificRole","visual-only").put("opacity",1.0))
    }
    fun extrudeCircle(source:String,radiusMeters:Double,heightMeters:Double,
        id:String=UUID.randomUUID().toString(),
        centerMeters:List<Double> = listOf(0.0,0.0,0.0),
        rotationRadians:List<Double> = listOf(0.0,0.0,0.0)):String=edit(source){project->
        require(radiusMeters.isFinite()&&radiusMeters in 0.0005..5000.0&&
            heightMeters.isFinite()&&heightMeters in 0.001..10000.0&&radiusMeters*2<=10000){
            "Closed circular sketch needs a bounded radius and height"
        }
        require(centerMeters.size==3&&centerMeters.all{it.isFinite()&&it in -100000.0..100000.0}&&
            rotationRadians.size==3&&rotationRadians.all{it.isFinite()&&it in -2*Math.PI..2*Math.PI}){
            "Sketch placement needs three bounded SI coordinates and finite Euler angles"
        }
        val entities=project.getJSONArray("entities")
        require(entities.length()<200&&id.matches(Regex("[A-Za-z0-9_-]{1,120}"))&&
            (0 until entities.length()).none{entities.getJSONObject(it).getString("id")==id}){
            "Extruded sketch has an invalid identity or the 200-solid limit is reached"
        }
        val diameter=radiusMeters*2
        val matrix=rotationMatrix(rotationRadians)
        val position=(0..2).map{centerMeters[it]+matrix[it][1]*heightMeters/2}
        require(position.all{it.isFinite()&&it in -100000.0..100000.0}){
            "Extruded solid centre leaves the local world"
        }
        entities.put(JSONObject().put("id",id).put("name","Extruded circular profile")
            .put("shape","cylinder").put("positionMeters",JSONArray(position))
            .put("dimensionsMeters",JSONArray(listOf(diameter,heightMeters,diameter)))
            .put("rotationRadians",JSONArray(rotationRadians))
            .put("color","#A4C9C6").put("materialId",JSONObject.NULL)
            .put("scientificRole","visual-only").put("opacity",1.0))
    }

    fun exportCadExchange(source:String):String{
        NativeWorldLabProjectCodec.decode(source)
        val root=JSONObject(source)
        val entities=root.getJSONArray("entities")
        val referenced=(0 until entities.length()).mapNotNull{index->
            val entity=entities.getJSONObject(index)
            if(entity.isNull("materialId"))null else entity.getString("materialId")
        }.toSet()
        val sourceMaterials=root.getJSONArray("materials")
        val materials=JSONArray()
        for(index in 0 until sourceMaterials.length()){
            val material=sourceMaterials.getJSONObject(index)
            if(material.getString("id") in referenced)materials.put(JSONObject(material.toString()))
        }
        val bundle=JSONObject()
            .put("format","env-world-lab-cad")
            .put("schemaVersion",1)
            .put("units","m")
            .put("coordinateFrame","LOCAL_ENU")
            .put("source",JSONObject().put("projectId",root.getString("id"))
                .put("revision",root.getInt("revision")))
            .put("entities",JSONArray(entities.toString()))
            .put("materials",materials)
        val json=bundle.toString(2)
        require(json.toByteArray(Charsets.UTF_8).size<=8*1024*1024){
            "CAD geometry export exceeds the 8 MB interchange limit."
        }
        return json
    }

    fun importCadExchange(source:String,cadJson:String):String{
        require(cadJson.toByteArray(Charsets.UTF_8).size<=8*1024*1024){
            "CAD geometry files must be 8 MB or smaller."
        }
        val bundle=JSONObject(cadJson)
        val requiredKeys=setOf("format","schemaVersion","units","coordinateFrame","source","entities","materials")
        require(bundle.keys().asSequence().toSet()==requiredKeys){
            "CAD geometry file contains missing or unsupported fields."
        }
        require(bundle.getString("format")=="env-world-lab-cad"&&
            bundle.getInt("schemaVersion")==1&&bundle.getString("units")=="m"&&
            bundle.getString("coordinateFrame")=="LOCAL_ENU"){
            "This CAD geometry version, unit system or coordinate frame is unsupported."
        }
        val metadata=bundle.getJSONObject("source")
        require(metadata.keys().asSequence().toSet()==setOf("projectId","revision")&&
            metadata.getString("projectId").matches(Regex("[A-Za-z0-9_-]{1,120}"))&&
            metadata.getInt("revision") in 0..1_000_000_000){
            "CAD source project identity or revision is invalid."
        }
        val importedEntities=bundle.getJSONArray("entities")
        val importedMaterials=bundle.getJSONArray("materials")
        require(importedEntities.length() in 1..200&&importedMaterials.length()<=100){
            "CAD geometry exceeds the 200-part or 100-material limit."
        }
        // Reuse the strict project codec to validate every primitive and hypothetical material.
        val probe=JSONObject(blank("CAD import validation"))
            .put("entities",JSONArray(importedEntities.toString()))
            .put("materials",JSONArray(importedMaterials.toString()))
        NativeWorldLabProjectCodec.decode(probe.toString())
        return edit(source){target->
            val existingEntities=target.getJSONArray("entities")
            require(existingEntities.length()+importedEntities.length()<=200){
                "Importing these parts would exceed the 200-solid invention limit."
            }
            val existingMaterials=target.getJSONArray("materials")
            val usedMaterialIds=(0 until existingMaterials.length())
                .map{existingMaterials.getJSONObject(it).getString("id")}.toMutableSet()
            val materialIdMap=mutableMapOf<String,String>()
            for(index in 0 until importedMaterials.length()){
                val original=importedMaterials.getJSONObject(index)
                val originalId=original.getString("id")
                val existing=(0 until existingMaterials.length()).map{existingMaterials.getJSONObject(it)}
                    .firstOrNull{it.getString("id")==originalId}
                if(existing!=null&&NativeWorldLabJsonEquality.same(existing,original)){
                    materialIdMap[originalId]=originalId
                    continue
                }
                var nextId=originalId
                if(nextId in usedMaterialIds){
                    do{nextId=UUID.randomUUID().toString()}while(nextId in usedMaterialIds)
                }
                usedMaterialIds.add(nextId)
                materialIdMap[originalId]=nextId
                existingMaterials.put(JSONObject(original.toString()).put("id",nextId))
            }
            require(existingMaterials.length()<=100){
                "Importing these assumptions would exceed the 100-material limit."
            }
            val usedEntityIds=(0 until existingEntities.length())
                .map{existingEntities.getJSONObject(it).getString("id")}.toMutableSet()
            for(index in 0 until importedEntities.length()){
                val original=importedEntities.getJSONObject(index)
                var nextId=original.getString("id")
                if(nextId in usedEntityIds){
                    do{nextId=UUID.randomUUID().toString()}while(nextId in usedEntityIds)
                }
                usedEntityIds.add(nextId)
                val clone=JSONObject(original.toString()).put("id",nextId)
                if(!clone.isNull("materialId")){
                    val oldMaterial=clone.getString("materialId")
                    clone.put("materialId",materialIdMap[oldMaterial]
                        ?:error("CAD part refers to a missing imported material."))
                }
                existingEntities.put(clone)
            }
        }
    }

    fun addHypotheticalMaterial(
        source:String,name:String,densityKgM3:Double?,youngModulusPa:Double?=null,
        id:String=UUID.randomUUID().toString(),
        thermalConductivityWPerMK:Double?=null,specificHeatJPerKgK:Double?=null,
        refractiveIndex:Double?=null
    ):String = edit(source){project->
        require(name.isNotBlank() && name.length<=120){"Hypothetical material needs a name."}
        require(densityKgM3==null || densityKgM3.isFinite() && densityKgM3 in 0.001..1e9){
            "Assumed density is outside the supported finite domain."
        }
        require(youngModulusPa==null || youngModulusPa.isFinite() && youngModulusPa in 0.0..1e15){
            "Assumed modulus is outside the supported finite domain."
        }
        require(thermalConductivityWPerMK==null||
            thermalConductivityWPerMK.isFinite()&&thermalConductivityWPerMK in 1e-6..1e6){
            "Invented conductivity must be finite in 1e-6..1e6 W/(m K)"}
        require(specificHeatJPerKgK==null||
            specificHeatJPerKgK.isFinite()&&specificHeatJPerKgK in 0.01..1e7){
            "Invented specific heat must be finite in 0.01..1e7 J/(kg K)"}
        require(refractiveIndex==null||
            refractiveIndex.isFinite()&&refractiveIndex in 1.0..5.0){
            "Invented refractive index must be 1–5"}
        val array=project.getJSONArray("materials")
        require(array.length()<100){"Only 100 materials can be stored."}
        require((0 until array.length()).none {array.getJSONObject(it).getString("id")==id}){"Duplicate material ID"}
        array.put(JSONObject().put("id",id).put("name",name)
            .put("densityKgM3",densityKgM3?:JSONObject.NULL)
            .put("youngModulusPa",youngModulusPa?:JSONObject.NULL)
            .put("thermalConductivityWPerMK",thermalConductivityWPerMK?:JSONObject.NULL)
            .put("specificHeatJPerKgK",specificHeatJPerKgK?:JSONObject.NULL)
            .put("refractiveIndex",refractiveIndex?:JSONObject.NULL)
            .put("evidence","hypothetical-user-assumed"))
    }
    /** Modify only hypothetical properties; retain material and solid identities. */
    fun reviseHypotheticalMaterial(source:String,id:String,name:String,
        densityKgM3:Double?,youngModulusPa:Double?,
        thermalConductivityWPerMK:Double?=null,
        specificHeatJPerKgK:Double?=null,
        refractiveIndex:Double?=null):String=edit(source){project->
        require(name.isNotBlank()&&name.length<=120){"Material name is required"}
        require(densityKgM3==null ||
            densityKgM3.isFinite()&&densityKgM3 in 0.001..1e9){
            "Assumed density is outside supported finite bounds"
        }
        require(youngModulusPa==null ||
            youngModulusPa.isFinite()&&youngModulusPa in 0.0..1e15){
            "Assumed Young's modulus is outside supported finite bounds"
        }
        require(thermalConductivityWPerMK==null||
            thermalConductivityWPerMK.isFinite()&&thermalConductivityWPerMK in 1e-6..1e6){
            "Invented conductivity must be finite and positive"}
        require(specificHeatJPerKgK==null||
            specificHeatJPerKgK.isFinite()&&specificHeatJPerKgK in 0.01..1e7){
            "Invented specific heat must be finite and positive"}
        require(refractiveIndex==null||
            refractiveIndex.isFinite()&&refractiveIndex in 1.0..5.0){
            "Invented refractive index must be 1–5"}
        val materials=project.getJSONArray("materials")
        val selected=(0 until materials.length()).map{materials.getJSONObject(it)}
            .firstOrNull{it.getString("id")==id}
            ?:error("Invented material to revise was not found")
        selected.put("name",name.trim())
            .put("densityKgM3",densityKgM3?:JSONObject.NULL)
            .put("youngModulusPa",youngModulusPa?:JSONObject.NULL)
            .put("thermalConductivityWPerMK",thermalConductivityWPerMK?:JSONObject.NULL)
            .put("specificHeatJPerKgK",specificHeatJPerKgK?:JSONObject.NULL)
            .put("refractiveIndex",refractiveIndex?:JSONObject.NULL)
            .put("evidence","hypothetical-user-assumed")
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
            val snapped=kotlin.math.floor(value/gridMeters+0.5)*gridMeters
            val rounded=kotlin.math.floor(snapped*1e6+0.5)/1e6
            require(rounded.isFinite() && rounded in -100000.0..100000.0){
                "Snapped coordinate is outside the local world"
            }
            if(rounded==0.0)0.0 else rounded
        }
        return positionSolid(source,id,position)
    }
    /** Snap every selected part in one validated edit and one revision. */
    fun snapSolids(source:String,ids:List<String>,gridMeters:Double):String=edit(source){project->
        require(gridMeters.isFinite()&&gridMeters in 0.001..100.0){
            "Grid spacing must be 0.001 to 100 metres"
        }
        val (_,selected)=selectedCadRows(project,ids)
        selected.forEach{solid->
            val original=solid.getJSONArray("positionMeters")
            require(original.length()==3){"Selected CAD coordinates are invalid"}
            val snapped=(0..2).map{axis->
                val raw=kotlin.math.floor(original.getDouble(axis)/gridMeters+0.5)*gridMeters
                val rounded=kotlin.math.floor(raw*1e6+0.5)/1e6
                require(rounded.isFinite()&&rounded in -100000.0..100000.0){
                    "Snapped position exceeds the local-world coordinate envelope"
                }
                if(rounded==0.0)0.0 else rounded
            }
            solid.put("positionMeters",JSONArray(snapped))
        }
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
        require(old.id==next.id && next.revision>old.revision){"History edits require one advancing project"}
        past.addLast(before)
        while(past.size>50)past.removeFirst()
        future.clear()
    }
    private fun restore(snapshot:String,current:String):String{
        val target=NativeWorldLabProjectCodec.decode(snapshot)
        val active=NativeWorldLabProjectCodec.decode(current)
        require(target.id==active.id){
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


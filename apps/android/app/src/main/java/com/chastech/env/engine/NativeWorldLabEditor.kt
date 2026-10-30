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
    fun addParallelCircuitResistor(source:String):String=edit(source){root->
        val networks=root.getJSONArray("networks")
        require(networks.length()>0)
        val components=networks.getJSONObject(0).getJSONArray("components")
        require(components.length()<48)
        components.put(JSONObject().put("id",UUID.randomUUID().toString())
            .put("kind","resistor").put("positiveNodeId","supply")
            .put("negativeNodeId","ground").put("resistanceOhm",200.0))
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
    fun assignMaterial(source:String,solidId:String,materialId:String?):String =
        edit(source){project->
            val arr=project.getJSONArray("entities")
            val found=(0 until arr.length()).firstOrNull{arr.getJSONObject(it).getString("id")==solidId}
                ?:error("This solid was not found.")
            arr.getJSONObject(found).put("materialId",materialId?:JSONObject.NULL)
        }
}

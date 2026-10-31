package com.chastech.env.engine

import kotlin.math.*
import org.json.JSONObject
import org.json.JSONArray
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Native primary-ray refraction through invented box/sphere geometry.
 * Fully local. Reflected branches are accounted for but not traced.
 */
data class NativeRayVector(val x:Double,val y:Double,val z:Double) {
    operator fun plus(b:NativeRayVector)=NativeRayVector(x+b.x,y+b.y,z+b.z)
    operator fun minus(b:NativeRayVector)=NativeRayVector(x-b.x,y-b.y,z-b.z)
    operator fun times(a:Double)=NativeRayVector(x*a,y*a,z*a)
    fun dot(b:NativeRayVector)=x*b.x+y*b.y+z*b.z
    fun length()=sqrt(dot(this))
    fun unit():NativeRayVector {
        val magnitude=length()
        require(magnitude.isFinite()&&magnitude>=1e-12){"Optical ray needs a nonzero finite direction."}
        return this*(1/magnitude)
    }
    fun json():JSONArray=JSONArray().put(x).put(y).put(z)
    fun bounded()=listOf(x,y,z).all{it.isFinite()&&abs(it)<=100000}
}
data class NativeOpticalRaySegment(
    val start:NativeRayVector,val end:NativeRayVector,
    val kind:String,val entityId:String?,
    val travelledMeters:Double,val incidentIndex:Double,
    val transmittedIndex:Double?,val reflectance:Double,
    val transmittance:Double,val remainingPower:Double
) {
    fun json():JSONObject=JSONObject().apply {
        put("startMeters",start.json());put("endMeters",end.json())
        put("kind",kind);put("entityId",entityId?:JSONObject.NULL)
        put("travelMeters",travelledMeters);put("incidentIndex",incidentIndex)
        put("transmittedIndex",transmittedIndex?:JSONObject.NULL)
        put("reflectance",reflectance);put("transmittance",transmittance)
        put("survivingRayPowerFraction",remainingPower)
    }
}
data class NativeOpticalSceneRun(
    val projectId:String,val projectRevision:Int,
    val origin:NativeRayVector,val direction:NativeRayVector,
    val maximumDistanceMeters:Double,val maximumInterfaces:Int,
    val segments:List<NativeOpticalRaySegment>,
    val discardedPower:Double,val finalPower:Double
) {
    val validity="Primary geometric ray through invented axis-aligned boxes and spheres " +
        "with user-assumed real lossless refractive indices. Reflected partial " +
        "branches are counted but not propagated. No measured materials, " +
        "diffraction, absorption, nested solids or verified optical performance."
    fun portableEvidence():String {
        val result=JSONObject().apply {
            put("format","env-world-lab-optical-scene-ray")
            put("modelVersion","1.0.0");put("evidence","physics-model-computed")
            put("materialEvidence","hypothetical-user-assumed")
            put("projectId",projectId);put("projectRevision",projectRevision)
            put("input",JSONObject().apply{
                put("originMeters",origin.json());put("direction",direction.json())
                put("maximumDistanceMeters",maximumDistanceMeters)
                put("maximumInterfaces",maximumInterfaces)
            })
            put("segments",JSONArray().apply{segments.forEach{put(it.json())}})
            put("accountedLostBranchPowerFraction",discardedPower)
            put("finalPrimaryRayPowerFraction",finalPower)
            put("validity",validity)
        }
        return JSONObject().apply {
            put("id",UUID.randomUUID().toString())
            put("projectId",projectId);put("projectRevision",projectRevision)
            put("createdAt",OffsetDateTime.now(ZoneOffset.UTC).toString())
            put("kind","optical-scene-ray");put("result",result)
        }.toString()
    }
}
object NativeWorldLabOpticalScene {
    private const val epsilon=1e-6
    private data class Body(
        val id:String,val shape:String,val center:NativeRayVector,
        val half:NativeRayVector,val index:Double
    )
    private data class Hit(val t:Double,val normal:NativeRayVector)
    private fun intersect(o:NativeRayVector,d:NativeRayVector,b:Body):Hit? {
        if(b.shape=="sphere"){
            val delta=o-b.center
            val projection=delta.dot(d)
            val discriminant=projection*projection-delta.dot(delta)+b.half.x*b.half.x
            if(discriminant<0)return null
            val root=sqrt(discriminant)
            var t=-projection-root
            if(t<=epsilon)t=-projection+root
            if(t<=epsilon)return null
            return Hit(t,(o+d*t-b.center).unit())
        }
        val axes=listOf(d.x,d.y,d.z)
        val origins=listOf(o.x,o.y,o.z)
        val centers=listOf(b.center.x,b.center.y,b.center.z)
        val halves=listOf(b.half.x,b.half.y,b.half.z)
        var start=Double.NEGATIVE_INFINITY
        var end=Double.POSITIVE_INFINITY
        var entry=NativeRayVector(0.0,0.0,0.0)
        var exit=entry
        for(i in 0..2){
            val min=centers[i]-halves[i]
            val max=centers[i]+halves[i]
            val delta=axes[i]
            if(abs(delta)<1e-12){
                if(origins[i]<min||origins[i]>max)return null
                continue
            }
            var near=(min-origins[i])/delta
            var far=(max-origins[i])/delta
            var side=-1.0
            if(near>far){val temp=near;near=far;far=temp;side=1.0}
            if(near>start){
                start=near
                entry=when(i){0->NativeRayVector(side,0.0,0.0)
                    1->NativeRayVector(0.0,side,0.0)
                    else->NativeRayVector(0.0,0.0,side)}
            }
            if(far<end){
                end=far
                exit=when(i){0->NativeRayVector(-side,0.0,0.0)
                    1->NativeRayVector(0.0,-side,0.0)
                    else->NativeRayVector(0.0,0.0,-side)}
            }
            if(start>end)return null
        }
        if(end<=epsilon)return null
        return if(start>epsilon)Hit(start,entry) else Hit(end,exit)
    }
    private fun inside(point:NativeRayVector,b:Body):Boolean {
        val delta=point-b.center
        return if(b.shape=="sphere")delta.length()<b.half.x-epsilon else
            abs(delta.x)<b.half.x-epsilon&&
            abs(delta.y)<b.half.y-epsilon&&
            abs(delta.z)<b.half.z-epsilon
    }
    fun trace(project:NativeWorldLabProject,origin:NativeRayVector,
        initialDirection:NativeRayVector,distanceMeters:Double,
        interfaceLimit:Int=8):NativeOpticalSceneRun {
        require(origin.bounded()&&initialDirection.bounded()&&
            distanceMeters.isFinite()&&distanceMeters in 0.1..1000.0&&
            interfaceLimit in 1..16){"Optical origin, path and event budget must be bounded."}
        val bodies=project.entities.mapNotNull{solid->
            val n=project.materials.firstOrNull{it.id==solid.materialId}?.refractiveIndex
            if(solid.scientificRole!="reference-solid"||
                solid.shape !in listOf("box","sphere")||n==null)null else
                Body(solid.id,solid.shape,
                    NativeRayVector(solid.positionMeters.x,solid.positionMeters.y,
                        solid.positionMeters.z),
                    NativeRayVector(solid.dimensionsMeters.x/2,
                        solid.dimensionsMeters.y/2,solid.dimensionsMeters.z/2),n)
        }
        require(bodies.size in 1..40){"Trace 1–40 indexed box/sphere reference solids."}
        require(bodies.none{inside(origin,it)}){"Begin the ray outside invented solids."}
        var position=origin
        var direction=initialDirection.unit()
        var medium:String?=null
        var travelled=0.0
        var power=1.0
        var reflectedPower=0.0
        val path=mutableListOf<NativeOpticalRaySegment>()
        for(step in 0..interfaceLimit){
            val left=distanceMeters-travelled
            if(left<=epsilon)break
            val hits=bodies.mapNotNull{body->
                val hit=intersect(position,direction,body)
                if(hit==null||hit.t>left+epsilon)null else body to hit
            }.sortedBy{it.second.t}
            if(hits.isEmpty()){
                path+=NativeOpticalRaySegment(position,position+direction*left,
                    "escaped",null,left,medium?.let{id->
                        bodies.first{it.id==id}.index}?:1.0,null,0.0,1.0,power)
                break
            }
            require(hits.size==1||abs(hits[0].second.t-hits[1].second.t)>=1e-7){
                "Two simultaneous optical contacts need a more detailed surface model."
            }
            val (body,hit)=hits.first()
            require(medium==null||medium==body.id){
                "Overlapping optical materials are unsupported."
            }
            val entering=direction.dot(hit.normal)<0
            require((entering&&medium==null)||(!entering&&medium==body.id)){
                "Optical ray crossed an ambiguous nested material."
            }
            val n1=if(entering)1.0 else body.index
            val n2=if(entering)body.index else 1.0
            val normal=if(entering)hit.normal else hit.normal*(-1.0)
            val cosine=max(0.0,-direction.dot(normal))
            val ratio=n1/n2
            val discriminant=1-ratio*ratio*(1-cosine*cosine)
            val total=discriminant<0
            val cost=if(total)0.0 else sqrt(max(0.0,discriminant))
            val s=if(total)1.0 else ((n1*cosine-n2*cost)/(n1*cosine+n2*cost)).pow(2)
            val p=if(total)1.0 else ((n2*cosine-n1*cost)/(n2*cosine+n1*cost)).pow(2)
            val reflectance=((s+p)/2).coerceIn(0.0,1.0)
            val transmission=1-reflectance
            val oldPower=power
            if(!total){
                power*=transmission
                reflectedPower+=oldPower*reflectance
            }
            val endpoint=position+direction*hit.t
            path+=NativeOpticalRaySegment(position,endpoint,
                if(total)"total-internal-reflection" else "transmitted",
                body.id,hit.t,n1,if(total)null else n2,
                reflectance,transmission,power)
            travelled+=hit.t
            direction=if(total)(direction+normal*(2*cosine)).unit() else
                (direction*ratio+normal*(ratio*cosine-cost)).unit()
            if(!total)medium=if(entering)body.id else null
            position=endpoint+direction*(2*epsilon)
            if(step==interfaceLimit) {
                path+=NativeOpticalRaySegment(endpoint,endpoint,
                    "limit",null,0.0,if(total)n1 else n2,null,0.0,1.0,power)
            }
        }
        require(path.isNotEmpty()&&path.all{
            it.start.bounded()&&it.end.bounded()&&
                it.remainingPower.isFinite()&&it.remainingPower in 0.0..1.0
        }){"Optical trace exceeded its finite spatial domain."}
        return NativeOpticalSceneRun(project.id,project.revision,
            origin,initialDirection,distanceMeters,interfaceLimit,
            path,reflectedPower,power)
    }
}

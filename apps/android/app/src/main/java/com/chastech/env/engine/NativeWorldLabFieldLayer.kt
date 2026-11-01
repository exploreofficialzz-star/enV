package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.math.abs
import kotlin.math.sqrt

enum class NativeWorldLabFieldKind { SCALAR, VECTOR, TENSOR }
enum class NativeWorldLabFieldPlane(val u:Int,val v:Int,val normal:Int) {
    XY(0,1,2), XZ(0,2,1), YZ(1,2,0)
}
data class NativeWorldLabFieldCell(
    val uIndex:Int,val vIndex:Int,val components:List<Double?>
)
data class NativeWorldLabFieldSliceFrame(
    val sampleTimeSeconds:Double,val sampleIndex:Int,val plane:NativeWorldLabFieldPlane,
    val sliceIndex:Int,val dimensionU:Int,val dimensionV:Int,
    val cells:List<NativeWorldLabFieldCell>
)
data class NativeWorldLabFieldVectorPoint(val u:Double,val v:Double)
data class NativeWorldLabFieldStreamlineFrame(
    val sampleTimeSeconds:Double,val sampleIndex:Int,val plane:NativeWorldLabFieldPlane,
    val sliceIndex:Int,val paths:List<List<NativeWorldLabFieldVectorPoint>>
)
data class NativeWorldLabFieldLayer(
    val id:String,val label:String,val kind:NativeWorldLabFieldKind,
    val siUnits:String,val displayUnits:String,val scaleToSI:Double,val offsetToSI:Double,
    val spatialFrame:String,val crs:String,val originMeters:List<Double>,
    val worldDateUTC:String,val sampleTimesSeconds:List<Double>,val timezoneDisplay:String,
    val sourceDescription:String,val calibrationStatus:String,val calibrationMethod:String,
    val dimensions:List<Int>,val spacingMeters:List<Double>,val interpolationMethod:String,
    val interpolationValidated:Boolean,val mask:List<Boolean>?,val values:List<Double?>,
    val minimumSI:Double,val maximumSI:Double,val permissionsScope:String,
    val readRoles:Set<String>,val exportAllowed:Boolean,val rendererKind:String,
    val rendererImplementationId:String,val legendTitle:String,val accessibleDescription:String,
    val validity:String
) {
    val cellCount:Int get()=dimensions[0]*dimensions[1]*dimensions[2]
    val componentCount:Int get()=when(kind){NativeWorldLabFieldKind.SCALAR->1;NativeWorldLabFieldKind.VECTOR->3;NativeWorldLabFieldKind.TENSOR->9}

    fun nearestSampleIndex(timeSeconds:Double):Int {
        require(timeSeconds.isFinite()&&timeSeconds>=0.0){"Field sample time must be finite and non-negative."}
        var selected=0;var distance=Double.POSITIVE_INFINITY
        sampleTimesSeconds.forEachIndexed { index,value ->
            val next=abs(value-timeSeconds)
            if(next<distance){distance=next;selected=index}
        }
        return selected
    }
    private fun cellIndex(x:Int,y:Int,z:Int)=x+dimensions[0]*(y+dimensions[1]*z)
    private fun sampleValues(sampleIndex:Int):List<Double?> {
        val count=cellCount*componentCount
        return values.subList(sampleIndex*count,(sampleIndex+1)*count)
    }
    private fun selectedSlice(
        timeSeconds:Double,plane:NativeWorldLabFieldPlane,requestedSliceIndex:Int
    ):NativeWorldLabFieldSliceFrame {
        val normalCount=dimensions[plane.normal]
        require(requestedSliceIndex in 0 until normalCount){"Field slice index is outside the grid resolution."}
        val sampleIndex=nearestSampleIndex(timeSeconds)
        val frame=sampleValues(sampleIndex)
        val cells=ArrayList<NativeWorldLabFieldCell>(dimensions[plane.u]*dimensions[plane.v])
        for(v in 0 until dimensions[plane.v]) for(u in 0 until dimensions[plane.u]) {
            val c=IntArray(3);c[plane.u]=u;c[plane.v]=v;c[plane.normal]=requestedSliceIndex
            val flat=cellIndex(c[0],c[1],c[2])
            val start=flat*componentCount
            cells.add(NativeWorldLabFieldCell(u,v,frame.subList(start,start+componentCount)))
        }
        return NativeWorldLabFieldSliceFrame(sampleTimesSeconds[sampleIndex],sampleIndex,plane,
            requestedSliceIndex,dimensions[plane.u],dimensions[plane.v],cells)
    }
    fun scalarSlice(timeSeconds:Double,plane:NativeWorldLabFieldPlane=NativeWorldLabFieldPlane.XY,
        sliceIndex:Int=(dimensions[plane.normal]-1)/2):NativeWorldLabFieldSliceFrame {
        require(kind==NativeWorldLabFieldKind.SCALAR&&rendererKind=="slice"){
            "Scalar slices require a scalar field with the slice renderer."
        }
        return selectedSlice(timeSeconds,plane,sliceIndex)
    }
    fun tensorSlice(timeSeconds:Double,component:Int,plane:NativeWorldLabFieldPlane=NativeWorldLabFieldPlane.XY,
        sliceIndex:Int=(dimensions[plane.normal]-1)/2):NativeWorldLabFieldSliceFrame {
        require(kind==NativeWorldLabFieldKind.TENSOR&&rendererKind=="slice"){
            "Tensor slices require a tensor field with the slice renderer."
        }
        require(component in 0..8){"Tensor component index must be between 0 and 8."}
        return selectedSlice(timeSeconds,plane,sliceIndex)
    }
    fun vectorGlyphs(timeSeconds:Double,plane:NativeWorldLabFieldPlane=NativeWorldLabFieldPlane.XY,
        sliceIndex:Int=(dimensions[plane.normal]-1)/2):NativeWorldLabFieldSliceFrame {
        require(kind==NativeWorldLabFieldKind.VECTOR&&rendererKind=="glyphs"){
            "Vector glyphs require the vector glyph renderer."
        }
        return selectedSlice(timeSeconds,plane,sliceIndex)
    }
    fun vectorDisplaySlice(timeSeconds:Double,plane:NativeWorldLabFieldPlane=NativeWorldLabFieldPlane.XY,
        sliceIndex:Int=(dimensions[plane.normal]-1)/2):NativeWorldLabFieldSliceFrame {
        require(kind==NativeWorldLabFieldKind.VECTOR&&rendererKind in setOf("glyphs","streamlines")){
            "Vector slice display requires a supported vector renderer."
        }
        return selectedSlice(timeSeconds,plane,sliceIndex)
    }
    private fun interpolateVector(frame:List<Double?>,plane:NativeWorldLabFieldPlane,u:Double,v:Double):Pair<Double,Double>? {
        val width=dimensions[plane.u];val height=dimensions[plane.v]
        if(u<0||v<0||u>width-1||v>height-1)return null
        val u0=kotlin.math.floor(u).toInt();val v0=kotlin.math.floor(v).toInt()
        val u1=(u0+1).coerceAtMost(width-1);val v1=(v0+1).coerceAtMost(height-1)
        val fu=u-u0;val fv=v-v0
        fun at(x:Int,y:Int,component:Int):Double? {
            val c=IntArray(3);c[plane.u]=x;c[plane.v]=y
            // A streamline is integrated on one selected plane, whose normal cell is supplied by caller.
            val flat=cellIndex(c[0],c[1],c[2])
            return frame[flat*3+component]
        }
        val a=at(u0,v0,plane.u)?:return null
        val b=at(u1,v0,plane.u)?:return null
        val c=at(u0,v1,plane.u)?:return null
        val d=at(u1,v1,plane.u)?:return null
        val av=at(u0,v0,plane.v)?:return null
        val bv=at(u1,v0,plane.v)?:return null
        val cv=at(u0,v1,plane.v)?:return null
        val dv=at(u1,v1,plane.v)?:return null
        return ((1-fv)*((1-fu)*a+fu*b)+fv*((1-fu)*c+fu*d)) to
            ((1-fv)*((1-fu)*av+fu*bv)+fv*((1-fu)*cv+fu*dv))
    }
    fun vectorStreamlines(timeSeconds:Double,plane:NativeWorldLabFieldPlane=NativeWorldLabFieldPlane.XY,
        sliceIndex:Int=(dimensions[plane.normal]-1)/2):NativeWorldLabFieldStreamlineFrame {
        require(kind==NativeWorldLabFieldKind.VECTOR&&rendererKind=="streamlines"){
            "Vector streamlines require the vector streamline renderer."
        }
        require(interpolationMethod=="linear"&&interpolationValidated){
            "Streamlines require validated linear interpolation."
        }
        require(sliceIndex in 0 until dimensions[plane.normal]){"Field slice index is outside the grid resolution."}
        val sampleIndex=nearestSampleIndex(timeSeconds)
        val raw=sampleValues(sampleIndex)
        // Copy the selected normal plane into a compact 2-D field; nodata remains absent.
        val frame=ArrayList<Double?>(dimensions[plane.u]*dimensions[plane.v]*3)
        for(v in 0 until dimensions[plane.v])for(u in 0 until dimensions[plane.u]){
            val c=IntArray(3);c[plane.u]=u;c[plane.v]=v;c[plane.normal]=sliceIndex
            val i=cellIndex(c[0],c[1],c[2])*3
            frame.addAll(raw.subList(i,i+3))
        }
        // Local vector sampling indexes the packed selected plane.
        fun sample(u:Double,v:Double):Pair<Double,Double>? {
            val w=dimensions[plane.u];val h=dimensions[plane.v]
            if(u<0||v<0||u>w-1||v>h-1)return null
            val x0=kotlin.math.floor(u).toInt();val y0=kotlin.math.floor(v).toInt()
            val x1=(x0+1).coerceAtMost(w-1);val y1=(y0+1).coerceAtMost(h-1)
            val fu=u-x0;val fv=v-y0
            fun valAt(x:Int,y:Int,c:Int)=frame[(x+w*y)*3+c]
            val a=valAt(x0,y0,0)?:return null;val b=valAt(x1,y0,0)?:return null
            val c=valAt(x0,y1,0)?:return null;val d=valAt(x1,y1,0)?:return null
            val av=valAt(x0,y0,1)?:return null;val bv=valAt(x1,y0,1)?:return null
            val cv=valAt(x0,y1,1)?:return null;val dv=valAt(x1,y1,1)?:return null
            return ((1-fv)*((1-fu)*a+fu*b)+fv*((1-fu)*c+fu*d)) to
                ((1-fv)*((1-fu)*av+fu*bv)+fv*((1-fu)*cv+fu*dv))
        }
        fun direction(u:Double,v:Double):Pair<Double,Double>? {
            val value=sample(u,v)?:return null
            val length=sqrt(value.first*value.first+value.second*value.second)
            if(!length.isFinite()||length<1e-12)return null
            return value.first/length to value.second/length
        }
        val seeds=(1..7).map { NativeWorldLabFieldVectorPoint(
            (dimensions[plane.u]-1)*it/8.0,(dimensions[plane.v]-1)*0.05
        ) }
        val paths=seeds.mapNotNull { seed ->
            val points=ArrayList<NativeWorldLabFieldVectorPoint>()
            var u=seed.u;var v=seed.v
            for(step in 0..120){
                if(u !in 0.0..(dimensions[plane.u]-1).toDouble()||
                    v !in 0.0..(dimensions[plane.v]-1).toDouble())break
                points.add(NativeWorldLabFieldVectorPoint(
                    if(dimensions[plane.u]<=1)0.0 else u/(dimensions[plane.u]-1),
                    if(dimensions[plane.v]<=1)0.0 else v/(dimensions[plane.v]-1)))
                val k1=direction(u,v)?:break
                val midpointU=u+k1.first*0.1;val midpointV=v+k1.second*0.1
                val k2=direction(midpointU,midpointV)?:break
                val nextU=u+k2.first*0.2;val nextV=v+k2.second*0.2
                if(abs(nextU-u)+abs(nextV-v)<1e-8)break
                u=nextU;v=nextV
            }
            points.takeIf{it.size>=2}
        }
        return NativeWorldLabFieldStreamlineFrame(sampleTimesSeconds[sampleIndex],sampleIndex,plane,sliceIndex,paths)
    }
}

object NativeWorldLabFieldLayerCodec {
    const val MAX_BYTES=16*1024*1024
    private const val MAX_CELLS=100_000
    private const val MAX_VALUES=2_000_000
    private fun string(o:JSONObject,key:String,max:Int=1000):String {
        val raw=o.opt(key)
        require(raw is String){"Field layer field '$key' must be a string."}
        val value=raw as String
        require(value.isNotBlank()&&value.length<=max){"Field layer field '$key' is missing or too long."}
        return value
    }
    private fun finiteNumber(v:Any?):Double {
        require(v is Number&&v.toDouble().isFinite()){"Field layer contains a non-finite numeric value."}
        return v.toDouble()
    }
    private fun arrayOfNumbers(a:JSONArray,key:String,count:Int):List<Double> {
        require(a.length()==count){"Field layer '$key' must contain $count values."}
        return (0 until count).map{finiteNumber(a.get(it))}
    }
    private fun utcDate(value:String):Boolean=runCatching{Instant.parse(value)}.isSuccess&&value.endsWith("Z")
    fun decode(data:ByteArray,principalRoles:Set<String> = emptySet()):NativeWorldLabFieldLayer {
        require(data.isNotEmpty()&&data.size<=MAX_BYTES){"Field layer JSON must be between 1 byte and 16 MB."}
        val root=runCatching{JSONObject(String(data,Charsets.UTF_8))}.getOrElse{
            throw IllegalArgumentException("Field layer is not valid JSON.")
        }
        require(root.optInt("schemaVersion",-1)==1){"Unsupported field-layer schema version."}
        val id=string(root,"id",120);val label=string(root,"label",240)
        val kind=when(string(root,"kind",20)){
            "scalar"->NativeWorldLabFieldKind.SCALAR
            "vector"->NativeWorldLabFieldKind.VECTOR
            "tensor"->NativeWorldLabFieldKind.TENSOR
            else->throw IllegalArgumentException("Native renderer supports scalar, vector and tensor fields only.")
        }
        val units=root.getJSONObject("units")
        val siUnits=string(units,"si",80);val displayUnits=string(units,"display",80)
        val scaleToSI=finiteNumber(units.opt("scaleToSI"));val offsetToSI=finiteNumber(units.opt("offsetToSI"))
        require(scaleToSI>0){"Field unit scale must be positive."}
        val spatial=root.getJSONObject("spatialReference")
        val spatialFrame=string(spatial,"frame",30);require(spatialFrame in setOf("LOCAL_ENU","WGS84","EPSG"))
        val crs=string(spatial,"crs",120);val origin=arrayOfNumbers(spatial.getJSONArray("originMeters"),"origin",3)
        val axes=spatial.getJSONArray("axisOrder")
        require(axes.length()==3&&axes.getString(0)=="x"&&axes.getString(1)=="y"&&axes.getString(2)=="z"){
            "Field axes must use x,y,z order."
        }
        val time=root.getJSONObject("timeReference")
        require(time.optString("kind") in setOf("simulation","UTC")){"Unknown field time reference."}
        val worldDate=string(time,"worldDateUTC",64);require(utcDate(worldDate)){"Invalid world-date UTC."}
        val timezone=time.optString("timezoneDisplay","UTC");require(timezone.length<=120)
        val samplesRaw=time.getJSONArray("sampleTimesSeconds")
        require(samplesRaw.length() in 1..100_000){"Field timeline must contain 1–100,000 samples."}
        val samples=(0 until samplesRaw.length()).map{finiteNumber(samplesRaw.get(it))}
        require(samples.first()>=0&&samples.zipWithNext().all{it.second>it.first}){"Field sample times must be increasing."}
        for(key in listOf("acquiredAtUTC","validFromUTC","validToUTC")){
            val v=time.opt(key)
            require(v==null||v==JSONObject.NULL||v is String&&utcDate(v)){"Invalid $key field timestamp."}
        }
        val source=root.getJSONObject("source")
        val sourceDescription=when(source.optString("kind")){
            "solver"->{
                val run=string(source,"runId",120);val model=string(source,"modelId",120)
                val version=string(source,"modelVersion",40)
                require(version.matches(Regex("^\\d+\\.\\d+\\.\\d+$"))&&
                    source.optString("evidence")=="physics-model-computed"&&
                    source.optString("inputEvidence")=="hypothetical-user-assumed"){
                    "Computed field provenance must identify a versioned solver and input evidence."
                }
                "Solver $model v$version · run $run"
            }
            "dataset"->{
                val provider=string(source,"provider",240);val dataset=string(source,"datasetId",240)
                val version=string(source,"datasetVersion",120);val license=string(source,"license",240)
                val retrieved=string(source,"retrievedAtUTC",64)
                require(utcDate(retrieved)&&source.optString("evidence") in setOf("measured-observed","forecast")){
                    "Dataset provenance needs a UTC retrieval time and evidence type."
                }
                "Dataset $provider · $dataset v$version · $license"
            }
            else->throw IllegalArgumentException("Field source provenance is missing.")
        }
        val calibration=root.getJSONObject("calibration")
        val calibrationStatus=string(calibration,"status",30)
        require(calibrationStatus in setOf("calibrated","uncalibrated","not-applicable"))
        val calibrationMethod=string(calibration,"method",500)
        val resolution=root.getJSONObject("resolution")
        val dimsRaw=resolution.getJSONArray("dimensions")
        require(dimsRaw.length()==3)
        val dims=(0..2).map{index->
            val value=finiteNumber(dimsRaw.get(index))
            require(value>0&&value%1.0==0.0&&value<=MAX_CELLS){"Field dimensions must be positive bounded integers."}
            value.toInt()
        }
        var cellProduct=1L
        dims.forEach { dimension->
            require(cellProduct<=MAX_CELLS.toLong()/dimension){"Field grid exceeds native cell limits."}
            cellProduct*=dimension
        }
        val cells=cellProduct.toInt()
        require(resolution.optInt("sampleCount",-1)==cells){"Field cell count does not match dimensions."}
        val spacing=arrayOfNumbers(resolution.getJSONArray("spacingMeters"),"spacing",3)
        require(spacing.all{it>=0})
        val interpolation=root.getJSONObject("interpolation")
        val interpolationMethod=string(interpolation,"method",20)
        require(interpolationMethod in setOf("none","nearest","linear"))
        val interpolationValidated=interpolation.optBoolean("validated",false)
        require(interpolation.optString("notes").isNotBlank())
        require(interpolationMethod!="linear"||interpolationValidated){"Unvalidated field interpolation is not permitted."}
        val renderer=root.getJSONObject("renderer")
        val rendererKind=string(renderer,"kind",20)
        val implementation=string(renderer,"implementationId",120)
        require(when(kind){
            NativeWorldLabFieldKind.SCALAR->rendererKind=="slice"
            NativeWorldLabFieldKind.VECTOR->rendererKind=="glyphs"||rendererKind=="streamlines"
            NativeWorldLabFieldKind.TENSOR->rendererKind=="slice"
        }){"Native field renderer does not implement the imported data kind."}
        if(rendererKind=="streamlines")require(interpolationMethod=="linear"&&interpolationValidated){
            "Vector streamlines need validated linear interpolation."
        }
        val components=when(kind){
            NativeWorldLabFieldKind.SCALAR->1;NativeWorldLabFieldKind.VECTOR->3;NativeWorldLabFieldKind.TENSOR->9
        }
        val expectedLong=samples.size.toLong()*cells.toLong()*components.toLong()
        require(expectedLong<=MAX_VALUES.toLong()){"Field import exceeds the 2,000,000-value native limit."}
        val expected=expectedLong.toInt()
        val valuesRaw=root.getJSONArray("values")
        require(valuesRaw.length()==expected){"Field data length does not match samples, dimensions and components."}
        val maskValue=root.opt("mask")
        val mask=if(maskValue==null||maskValue==JSONObject.NULL)null else {
            require(maskValue is JSONArray&&maskValue.length()==expected){"Field nodata mask has the wrong size."}
            (0 until expected).map{maskValue.get(it) as? Boolean ?: throw IllegalArgumentException("Field mask must contain booleans.")}
        }
        val values=(0 until expected).map{index->
            val rawValue=valuesRaw.get(index)
            val valid=mask==null||mask[index]
            if(valid)finiteNumber(rawValue) else {
                require(rawValue==JSONObject.NULL){"Masked field cells must be JSON null."};null
            }
        }
        val range=root.getJSONObject("range")
        val minimum=finiteNumber(range.opt("minimumSI"));val maximum=finiteNumber(range.opt("maximumSI"))
        require(minimum<=maximum&&range.optString("scale") in setOf("linear","log")&&
            (range.optString("scale")!="log"||minimum>0)){"Field value range is invalid."}
        require(values.filterNotNull().all{it in minimum..maximum&&
            (range.optString("scale")!="log"||it>0)}){"Field values exceed their declared SI range."}
        val events=root.getJSONArray("events")
        require(events.length()==0){"Native dense field renderer does not accept event-trace records."}
        require(root.isNull("network")){"Native dense field renderer does not accept network graph records."}
        val permissions=root.getJSONObject("permissions")
        val scope=string(permissions,"scope",20)
        require(scope in setOf("private","shared","public"))
        val rolesArray=permissions.getJSONArray("readRoles")
        val roles=(0 until rolesArray.length()).map{index->
            val role=rolesArray.get(index)
            require(role is String&&role.isNotBlank()&&role.length<=80){"Field read roles must be bounded non-empty strings."}
            role as String
        }.toSet()
        when(scope){
            "private"->require("owner" in principalRoles&&("owner" in roles||"*" in roles)){
                "Private field layer requires an authenticated local owner role."
            }
            "shared"->require(principalRoles.any{it in roles||"*" in roles}){
                "Shared field layer is not readable by the current principal."
            }
            "public"->Unit
        }
        val exportAllowed=permissions.optBoolean("exportAllowed",false)
        val legend=root.getJSONObject("legend")
        val legendTitle=string(legend,"title",240)
        require(legend.optString("palette") in setOf("cividis","viridis","magma","blue-orange")){"Field legend palette is unsupported."}
        val accessible=string(legend,"accessibleDescription",1000)
        val validity=string(root,"validity",1000)
        return NativeWorldLabFieldLayer(id,label,kind,siUnits,displayUnits,scaleToSI,offsetToSI,
            spatialFrame,crs,origin,worldDate,samples,timezone,sourceDescription,calibrationStatus,
            calibrationMethod,dims,spacing,interpolationMethod,interpolationValidated,mask,values,
            minimum,maximum,scope,roles,exportAllowed,rendererKind,implementation,legendTitle,
            accessible,validity)
    }
}

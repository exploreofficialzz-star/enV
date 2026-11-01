package com.chastech.env.engine

/**
 * Native, independently implemented World Lab scientific quantity/port contract.
 * SI canonical numerical values; no unknown-property interpolation or measurement
 * claims without a source. Dimension tuple: kg,m,s,A,K,mol,cd.
 */
data class NativeScienceQuantity(
    val valueSI:Double,val unit:String,val dimension:List<Int>,
    val evidence:String,val sourceId:String?,val uncertaintySI:Double?
)
data class NativeSciencePort(
    val id:String,val direction:String,val unit:String,
    val frame:String,val flow:String
)
object NativeWorldLabSI {
    private data class Spec(val dimensions:List<Int>,val factor:Double)
    private val units=mapOf(
        "1" to Spec(listOf(0,0,0,0,0,0,0),1.0),
        "kg" to Spec(listOf(1,0,0,0,0,0,0),1.0),
        "g" to Spec(listOf(1,0,0,0,0,0,0),0.001),
        "m" to Spec(listOf(0,1,0,0,0,0,0),1.0),
        "cm" to Spec(listOf(0,1,0,0,0,0,0),0.01),
        "mm" to Spec(listOf(0,1,0,0,0,0,0),0.001),
        "km" to Spec(listOf(0,1,0,0,0,0,0),1000.0),
        "s" to Spec(listOf(0,0,1,0,0,0,0),1.0),
        "ms" to Spec(listOf(0,0,1,0,0,0,0),0.001),
        "min" to Spec(listOf(0,0,1,0,0,0,0),60.0),
        "h" to Spec(listOf(0,0,1,0,0,0,0),3600.0),
        "A" to Spec(listOf(0,0,0,1,0,0,0),1.0),
        "mA" to Spec(listOf(0,0,0,1,0,0,0),0.001),
        "K" to Spec(listOf(0,0,0,0,1,0,0),1.0),
        "mol" to Spec(listOf(0,0,0,0,0,1,0),1.0),
        "cd" to Spec(listOf(0,0,0,0,0,0,1),1.0),
        "m2" to Spec(listOf(0,2,0,0,0,0,0),1.0),
        "m3" to Spec(listOf(0,3,0,0,0,0,0),1.0),
        "m/s" to Spec(listOf(0,1,-1,0,0,0,0),1.0),
        "m/s2" to Spec(listOf(0,1,-2,0,0,0,0),1.0),
        "kg/m3" to Spec(listOf(1,-3,0,0,0,0,0),1.0),
        "N" to Spec(listOf(1,1,-2,0,0,0,0),1.0),
        "N/m" to Spec(listOf(1,0,-2,0,0,0,0),1.0),
        "N/A" to Spec(listOf(1,1,-2,-1,0,0,0),1.0),
        "Pa" to Spec(listOf(1,-1,-2,0,0,0,0),1.0),
        "kPa" to Spec(listOf(1,-1,-2,0,0,0,0),1000.0),
        "J" to Spec(listOf(1,2,-2,0,0,0,0),1.0),
        "kJ" to Spec(listOf(1,2,-2,0,0,0,0),1000.0),
        "W" to Spec(listOf(1,2,-3,0,0,0,0),1.0),
        "V" to Spec(listOf(1,2,-3,-1,0,0,0),1.0),
        "ohm" to Spec(listOf(1,2,-3,-2,0,0,0),1.0),
        "F" to Spec(listOf(-1,-2,4,2,0,0,0),1.0),
        "H" to Spec(listOf(1,2,-2,-2,0,0,0),1.0),
        "C" to Spec(listOf(0,0,1,1,0,0,0),1.0),
        "J/K" to Spec(listOf(1,2,-2,0,-1,0,0),1.0),
        "J/(kg*K)" to Spec(listOf(0,2,-2,0,-1,0,0),1.0),
        "W/K" to Spec(listOf(1,2,-3,0,-1,0,0),1.0),
        "W/(m*K)" to Spec(listOf(1,1,-3,0,-1,0,0),1.0)
    )
    private val evidenceLabels=setOf("measured-observed","physics-model-computed",
        "hypothetical-user-assumed","unknown-insufficient-evidence")
    fun declare(value:Double,unit:String,
        evidence:String="hypothetical-user-assumed",sourceId:String?=null,
        uncertainty:Double?=null):NativeScienceQuantity {
        val spec=units[unit]?:throw IllegalArgumentException("Unsupported scientific unit")
        require(value.isFinite()&&kotlin.math.abs(value)<=1e30){"Nonfinite scientific value"}
        require(evidence in evidenceLabels&&evidence!="unknown-insufficient-evidence"){
            "Unknown scientific quantity must remain unassigned"}
        if(evidence=="measured-observed")require(!sourceId.isNullOrBlank()){
            "Observed values require recorded provenance"}
        require(sourceId==null||sourceId.matches(Regex("[A-Za-z0-9:_-]{1,120}"))){
            "Invalid scientific source ID"}
        require(uncertainty==null||uncertainty.isFinite()&&uncertainty in 0.0..1e30){
            "Invalid uncertainty"}
        if(unit=="K")require(value>=0){"Absolute Kelvin cannot be negative"}
        val canonical=value*spec.factor
        val sigma=uncertainty?.times(spec.factor)
        require(canonical.isFinite()&&(sigma?.isFinite()?:true)){
            "Scientific value or uncertainty exceeds finite SI bounds"
        }
        return NativeScienceQuantity(canonical,unit,spec.dimensions.toList(),evidence,sourceId,sigma)
    }
    fun validate(value:NativeScienceQuantity) {
        val spec=units[value.unit]?:error("Unknown scientific source unit")
        require(value.dimension==spec.dimensions&&value.valueSI.isFinite()&&
            kotlin.math.abs(value.valueSI)<=1e30){"Malformed canonical scientific quantity"}
        require(value.evidence in evidenceLabels&&value.evidence!="unknown-insufficient-evidence"){
            "Unknown scientific values must remain unassigned"
        }
        require(value.sourceId==null||value.sourceId.matches(Regex("[A-Za-z0-9:_-]{1,120}"))){
            "Invalid scientific source provenance"
        }
        if(value.evidence=="measured-observed")require(!value.sourceId.isNullOrBlank()){
            "Measured values require a source ID"
        }
        require(value.uncertaintySI==null||value.uncertaintySI.isFinite()&&value.uncertaintySI in 0.0..1e30){
            "Invalid canonical uncertainty"
        }
        if(value.unit=="K")require(value.valueSI>=0.0){"Absolute Kelvin cannot be negative"}
    }
    fun convert(quantity:NativeScienceQuantity,unit:String):Double {
        validate(quantity)
        val original=units[quantity.unit]?:error("Unknown scientific source unit")
        val target=units[unit]?:error("Unknown scientific target unit")
        require(original.dimensions==quantity.dimension&&
            original.dimensions==target.dimensions){"Dimensional mismatch"}
        require(quantity.valueSI.isFinite()){"Nonfinite scientific exchange"}
        return quantity.valueSI/target.factor
    }
    fun compatible(from:NativeSciencePort,to:NativeSciencePort) {
        require(from.direction in setOf("output","bidirectional")&&
            to.direction in setOf("input","bidirectional")){"Invalid scientific port direction"}
        require(from.frame==to.frame&&from.flow==to.flow){"Incompatible scientific frame or flow"}
        val source=units[from.unit]?:error("Unknown source port unit")
        val target=units[to.unit]?:error("Unknown target port unit")
        require(source.dimensions==target.dimensions){"Incompatible port dimensions"}
    }
}


data class NativeScienceComponent(val id:String,val modelId:String,
    val ports:List<NativeSciencePort>)
data class NativeScienceConnection(
    val fromComponentId:String,val fromPortId:String,
    val toComponentId:String,val toPortId:String,val delayed:Boolean=false)
data class NativeScientificGraph(
    val projectId:String,val projectRevision:Int,
    val components:List<NativeScienceComponent>,
    val connections:List<NativeScienceConnection>)
object NativeWorldLabGraph {
    private val id=Regex("[A-Za-z0-9_-]{1,120}")
    /** Fail closed on untyped, duplicate or instantaneous cyclic science graphs. */
    fun validate(g:NativeScientificGraph):NativeScientificGraph {
        require(id.matches(g.projectId)&&g.projectRevision in 0..1000000000 &&
            g.components.size in 1..128 && g.connections.size<=512){
            "Invalid scientific graph identity, revision or resource budget"}
        val ids=mutableMapOf<String,NativeScienceComponent>()
        g.components.forEach{c->
            require(id.matches(c.id)&&id.matches(c.modelId)&&
                !ids.containsKey(c.id)&&c.ports.size in 1..20){
                "Duplicate scientific component or invalid port count"}
            val portIds=mutableSetOf<String>()
            c.ports.forEach{p->
                require(id.matches(p.id)&&portIds.add(p.id)&&
                    p.direction in setOf("input","output","bidirectional")&&
                    p.frame in setOf("SCALAR","LOCAL_ENU","ECEF","INERTIAL")&&
                    p.flow in setOf("electrical","mechanical","thermal","fluid","chemical","signal")){
                    "Invalid scientific port metadata"}
                NativeWorldLabSI.declare(0.0,p.unit)
            }
            ids[c.id]=c
        }
        val destinations=mutableSetOf<String>()
        val arcs=ids.keys.associateWith{mutableSetOf<String>()}.toMutableMap()
        g.connections.forEach{edge->
            val from=ids[edge.fromComponentId]?.ports?.firstOrNull{it.id==edge.fromPortId}
            val to=ids[edge.toComponentId]?.ports?.firstOrNull{it.id==edge.toPortId}
            require(from!=null&&to!=null){"Scientific connection references an absent port"}
            NativeWorldLabSI.compatible(from,to)
            require(destinations.add(edge.toComponentId+":"+edge.toPortId)){
                "Only one upstream scientific source per input"}
            if(!edge.delayed)arcs.getValue(edge.fromComponentId).add(edge.toComponentId)
        }
        val done=mutableSetOf<String>()
        val active=mutableSetOf<String>()
        fun visit(key:String){
            require(active.add(key)){"Instantaneous scientific algebraic feedback cycle"}
            if(key !in done){
                arcs.getValue(key).forEach{if(it !in done)visit(it)}
                done.add(key)
            }
            active.remove(key)
        }
        ids.keys.forEach{if(it !in done)visit(it)}
        return g
    }
}


data class NativeScientificStepOutput(
    val outputs:Map<String,NativeScienceQuantity>,val suppliedW:Double,
    val dissipatedW:Double,val storedRateW:Double,val nextEventSeconds:Double?=null
)
data class NativeScientificAdapter(
    val componentId:String,val modelId:String,val modelVersion:String,
    val advance:(Double,Double,Map<String,NativeScienceQuantity>)->NativeScientificStepOutput
)
data class NativeScientificExchangeSample(
    val timeSeconds:Double,val stepSeconds:Double,val eventBoundary:Boolean,
    val values:Map<String,NativeScienceQuantity>,val suppliedW:Double,
    val dissipatedW:Double,val storedRateW:Double,val residualW:Double
)
data class NativeScientificRun(
    val graph:NativeScientificGraph,val samples:List<NativeScientificExchangeSample>
)
/** Deterministic native SI/event scheduler. Only app-registered adapters execute; projects carry data only. */
object NativeWorldLabExecution {
    fun execute(graph:NativeScientificGraph,adapters:List<NativeScientificAdapter>,
        durationSeconds:Double,stepSeconds:Double,powerToleranceW:Double=1e-6):NativeScientificRun {
        NativeWorldLabGraph.validate(graph)
        require(durationSeconds.isFinite()&&durationSeconds in 0.001..60.0&&
            stepSeconds.isFinite()&&stepSeconds in 1e-5..1.0&&
            kotlin.math.ceil(durationSeconds/stepSeconds)<=20000.0){
            "Scientific timeline exceeds bounded execution steps"
        }
        require(powerToleranceW.isFinite()&&powerToleranceW in 0.0..1e6){"Invalid conservation tolerance"}
        require(adapters.size==graph.components.size){"One trusted adapter is required for each component"}
        val byId=adapters.associateBy{it.componentId}
        require(byId.size==adapters.size){"Duplicate trusted component adapter"}
        val components=graph.components.associateBy{it.id}
        graph.components.forEach{part->
            val adapter=byId[part.id]
            require(adapter!=null&&adapter.modelId==part.modelId&&
                adapter.modelVersion.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))){
                "Unregistered or mismatched scientific model version"
            }
        }
        val adjacency=graph.components.associate{it.id to linkedSetOf<String>()}.toMutableMap()
        val indegree=graph.components.associate{it.id to 0}.toMutableMap()
        graph.connections.filter{!it.delayed}.forEach{edge->
            if(adjacency.getValue(edge.fromComponentId).add(edge.toComponentId))
                indegree[edge.toComponentId]=indegree.getValue(edge.toComponentId)+1
        }
        val ready=indegree.filterValues{it==0}.keys.sorted().toMutableList()
        val order=mutableListOf<String>()
        while(ready.isNotEmpty()){
            val id=ready.removeAt(0);order.add(id)
            adjacency.getValue(id).sorted().forEach{next->
                indegree[next]=indegree.getValue(next)-1
                if(indegree.getValue(next)==0){ready.add(next);ready.sort()}
            }
        }
        require(order.size==components.size){"Algebraic loop requires an explicitly supported implicit solver"}
        val samples=mutableListOf<NativeScientificExchangeSample>()
        var now=0.0
        var scheduled:Double?=null
        var previous=emptyMap<String,NativeScienceQuantity>()
        while(now<durationSeconds-1e-12&&samples.size<20000){
            val end=minOf(durationSeconds,now+stepSeconds,scheduled?:durationSeconds)
            require(end>now+1e-12){"Scientific solver failed to advance"}
            val values=linkedMapOf<String,NativeScienceQuantity>()
            val newEvents=mutableListOf<Double>()
            var supplied=0.0;var dissipated=0.0;var stored=0.0
            for(id in order){
                val component=components.getValue(id)
                val inputs=linkedMapOf<String,NativeScienceQuantity>()
                graph.connections.filter{it.toComponentId==id}.forEach{edge->
                    val sourceValues=if(edge.delayed)previous else values
                    val source=sourceValues[edge.fromComponentId+":"+edge.fromPortId]
                        ?:return@forEach
                    val port=component.ports.first{it.id==edge.toPortId}
                    val converted=source.copy(unit=port.unit)
                    NativeWorldLabSI.validate(converted)
                    inputs[port.id]=converted
                }
                val output=byId.getValue(id).advance(end,end-now,inputs.toMap())
                require(output.outputs.keys.all{key->component.ports.any{it.id==key&&it.direction!="input"}}){
                    "Solver emitted an unregistered output port"
                }
                output.outputs.forEach{(portId,value)->
                    val port=component.ports.first{it.id==portId}
                    NativeWorldLabSI.validate(value)
                    require(value.unit==port.unit){"Solver output unit differs from its declared SI interface"}
                    values[id+":"+portId]=value
                }
                require(listOf(output.suppliedW,output.dissipatedW,output.storedRateW)
                    .all{it.isFinite()&&kotlin.math.abs(it)<=1e18}&&output.dissipatedW>=0.0){
                    "Scientific solver emitted an invalid rate or negative dissipation"
                }
                supplied+=output.suppliedW;dissipated+=output.dissipatedW;stored+=output.storedRateW
                output.nextEventSeconds?.let{event->
                    require(event.isFinite()&&event>end+1e-10&&event<=durationSeconds){
                        "Solver proposed an invalid future event boundary"
                    }
                    newEvents.add(event)
                }
            }
            val residual=supplied-dissipated-stored
            require(residual.isFinite()&&kotlin.math.abs(residual)<=powerToleranceW+
                1e-9*maxOf(1.0,kotlin.math.abs(supplied),kotlin.math.abs(dissipated))){
                "Power conservation residual exceeded tolerance"
            }
            samples.add(NativeScientificExchangeSample(end,end-now,
                scheduled!=null&&kotlin.math.abs(end-scheduled)<1e-9,values.toMap(),
                supplied,dissipated,stored,residual))
            previous=values.toMap();now=end;scheduled=newEvents.minOrNull()
        }
        require(samples.isNotEmpty()&&kotlin.math.abs(samples.last().timeSeconds-durationSeconds)<=1e-9){
            "Scientific simulation failed to reach its duration"
        }
        return NativeScientificRun(graph,samples.toList())
    }
    fun idealRcAdapters(sourceVoltageV:Double,resistanceOhm:Double,capacitanceF:Double,
        initialVoltageV:Double=0.0):List<NativeScientificAdapter>{
        require(sourceVoltageV.isFinite()&&kotlin.math.abs(sourceVoltageV)<=1000.0&&
            initialVoltageV.isFinite()&&kotlin.math.abs(initialVoltageV)<=1000.0&&
            resistanceOhm.isFinite()&&resistanceOhm in 0.001..1e9&&
            capacitanceF.isFinite()&&capacitanceF in 1e-9..1000.0){
            "Ideal RC assumptions are outside the supported physical domain"
        }
        val source=NativeScientificAdapter("source","ideal-dc-source","1.0.0"){_,_,_->
            NativeScientificStepOutput(mapOf("V" to NativeWorldLabSI.declare(sourceVoltageV,"V")),0.0,0.0,0.0)
        }
        val load=NativeScientificAdapter("load","series-rc-load","1.0.0"){time,_,inputs->
            require(inputs.containsKey("Vin")){"RC load requires its connected source voltage"}
            val voltage=sourceVoltageV+(initialVoltageV-sourceVoltageV)*
                kotlin.math.exp(-time/(resistanceOhm*capacitanceF))
            val current=(sourceVoltageV-voltage)/resistanceOhm
            NativeScientificStepOutput(mapOf(
                "Vc" to NativeWorldLabSI.declare(voltage,"V","physics-model-computed"),
                "I" to NativeWorldLabSI.declare(current,"A","physics-model-computed")
            ),sourceVoltageV*current,current*current*resistanceOhm,voltage*current)
        }
        return listOf(source,load)
    }
}

package com.chastech.env.engine

/** Native bounded zero-dimensional chemical and thermal coupling, not verified chemistry. */
data class NativeChemicalThermalInput(
    val initialReactantMol:Double=1.0,
    val initialTemperatureK:Double=300.0,
    val ambientTemperatureK:Double=300.0,
    val preExponentialPerS:Double=0.5,
    val activationEnergyJPerMol:Double=10000.0,
    val reactionHeatReleasedJPerMol:Double=50000.0,
    val heatCapacityJPerK:Double=500.0,
    val coolingConductanceWPerK:Double=5.0,
    val externalHeatingW:Double=0.0,
    val durationSeconds:Double=6.0
)
data class NativeChemicalThermalSample(
    val timeSeconds:Double,val reactantRemainingMol:Double,
    val productFormedMol:Double,val reactionRateMolPerS:Double,
    val temperatureK:Double,val reactionPowerW:Double,
    val coolingPowerW:Double,val cumulativeChemicalHeatJ:Double,
    val cumulativeExternalHeatJ:Double,val cumulativeCoolingJ:Double,
    val storedThermalEnergyJ:Double,val energyResidualJ:Double
)
data class NativeChemicalThermalResult(
    val input:NativeChemicalThermalInput,val samples:List<NativeChemicalThermalSample>,
    val stepSeconds:Double,val evidence:String="physics-model-computed",
    val validity:String="Hypothetical first-order Arrhenius conversion and well-mixed thermal mass; "+
        "no chemical identity, selectivity, spatial chemistry or tested material assumptions."
)
object NativeWorldLabChemicalThermal {
    fun evaluate(i:NativeChemicalThermalInput,requestedStepSeconds:Double=1.0/120):
        NativeChemicalThermalResult {
        fun bound(x:Double,min:Double,max:Double,name:String){
            require(x.isFinite()&&x in min..max){"$name outside assumed reaction bounds"}
        }
        bound(i.initialReactantMol,0.001,10000.0,"Reactant")
        bound(i.initialTemperatureK,200.0,1200.0,"Initial temperature")
        bound(i.ambientTemperatureK,200.0,1200.0,"Ambient temperature")
        bound(i.preExponentialPerS,0.0,100000.0,"Frequency factor")
        bound(i.activationEnergyJPerMol,0.0,200000.0,"Activation energy")
        bound(i.reactionHeatReleasedJPerMol,-1e6,1e6,"Reaction heat")
        bound(i.heatCapacityJPerK,1.0,1e6,"Heat capacity")
        bound(i.coolingConductanceWPerK,0.0,10000.0,"Cooling")
        bound(i.externalHeatingW,-10000.0,10000.0,"External heat")
        bound(i.durationSeconds,0.1,60.0,"Duration")
        bound(requestedStepSeconds,0.0001,0.05,"Step")
        val stiffRate=maxOf(1.0,i.coolingConductanceWPerK/i.heatCapacityJPerK,
            i.preExponentialPerS*kotlin.math.exp(
                -i.activationEnergyJPerMol/(8.31446261815324*2000)))
        val steps=kotlin.math.ceil(i.durationSeconds/kotlin.math.min(
            requestedStepSeconds,0.04/stiffRate)).toInt()
        require(steps<=50000){"Specialized stiff reaction solver required"}
        val dt=i.durationSeconds/steps
        fun rate(n:Double,t:Double)=i.preExponentialPerS*
            kotlin.math.exp(-i.activationEnergyJPerMol/
                (8.31446261815324*kotlin.math.max(1.0,t)))*n
        fun derivative(s:DoubleArray):DoubleArray{
            val r=rate(s[0],s[1])
            val cooling=i.coolingConductanceWPerK*(s[1]-i.ambientTemperatureK)
            return doubleArrayOf(-r,(i.reactionHeatReleasedJPerMol*r+
                i.externalHeatingW-cooling)/i.heatCapacityJPerK)
        }
        fun next(s:DoubleArray):DoubleArray{
            val k1=derivative(s)
            fun shifted(k:DoubleArray,f:Double)=doubleArrayOf(
                s[0]+dt*k[0]*f,s[1]+dt*k[1]*f)
            val k2=derivative(shifted(k1,0.5))
            val k3=derivative(shifted(k2,0.5))
            val k4=derivative(shifted(k3,1.0))
            return doubleArrayOf(s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6.0,
                s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6.0)
        }
        var state=doubleArrayOf(i.initialReactantMol,i.initialTemperatureK)
        var coolingAccumulated=0.0
        val output=ArrayList<NativeChemicalThermalSample>(steps+1)
        for(j in 0..steps){
            val n=state[0];val t=state[1]
            val produced=i.initialReactantMol-n
            val r=rate(n,t)
            val chemistry=i.reactionHeatReleasedJPerMol*produced
            val external=i.externalHeatingW*j*dt
            val stored=i.heatCapacityJPerK*(t-i.initialTemperatureK)
            val cooling=i.coolingConductanceWPerK*(t-i.ambientTemperatureK)
            val residual=chemistry+external-stored-coolingAccumulated
            require(listOf(n,t,r,produced,chemistry,external,stored,cooling,residual).all{
                it.isFinite()}&&n>=-1e-6&&n<=i.initialReactantMol+1e-6&&t in 150.0..2000.0){
                "Chemical/thermal trajectory left finite supported bounds"
            }
            output.add(NativeChemicalThermalSample(j*dt,n,produced,r,t,
                i.reactionHeatReleasedJPerMol*r,cooling,
                chemistry,external,coolingAccumulated,stored,residual))
            if(j==steps)break
            val next=next(state)
            require(next.all{it.isFinite()}&&next[0]>=-1e-6&&
                next[0]<=i.initialReactantMol+1e-6&&next[1] in 150.0..2000.0){
                "Chemical integration became numerically unstable"
            }
            val nextCooling=i.coolingConductanceWPerK*(next[1]-i.ambientTemperatureK)
            coolingAccumulated+=0.5*dt*(cooling+nextCooling)
            state=doubleArrayOf(next[0].coerceIn(0.0,i.initialReactantMol),next[1])
        }
        return NativeChemicalThermalResult(i,output,dt)
    }
}

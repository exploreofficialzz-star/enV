package com.chastech.env.engine

import kotlin.math.*

/**
 * Independent Android implementation of the bounded inventor vehicle model.
 * SI units throughout. This is not a 6-DOF dynamics or flight-certification solver.
 */
data class NativeWorldLabVehicleInput(
    val mode: String = "road-only",
    val massKg: Double = 1200.0,
    val frontalAreaM2: Double = 2.2,
    val dragCoefficient: Double = 0.32,
    val airDensityKgM3: Double = 1.225,
    val rollingResistance: Double = 0.012,
    val tireFriction: Double = 0.9,
    val maxWheelForceN: Double = 6500.0,
    val motorMaxPowerW: Double = 180000.0,
    val motorEfficiency: Double = 0.9,
    val motorForceConstantNPerA: Double = 40.0,
    val motorWindingResistanceOhm: Double = 0.08,
    val motorMaxCurrentA: Double = 220.0,
    val batteryVoltageV: Double = 400.0,
    val batteryResistanceOhm: Double = 0.04,
    val batteryMaxCurrentA: Double = 500.0,
    val batteryCapacityWh: Double = 60000.0,
    val initialSoc: Double = 1.0,
    val batteryHeatCapacityJPerK: Double = 180000.0,
    val batteryCoolingWPerK: Double = 35.0,
    val maxBatteryTemperatureK: Double = 370.0,
    val motorHeatCapacityJPerK: Double = 45000.0,
    val motorCoolingWPerK: Double = 80.0,
    val maxMotorTemperatureK: Double = 420.0,
    val ambientTemperatureK: Double = 293.15,
    val initialMotorTemperatureK: Double = 293.15,
    val initialBatteryTemperatureK: Double = 293.15,
    val rotorDiskAreaM2: Double? = null,
    val rotorMaxThrustN: Double? = null,
    val rotorThrottle: Double = 0.85,
    val rotorEfficiency: Double = 0.8,
    val wingAreaM2: Double? = null,
    val wingLiftCoefficient: Double? = null,
    val takeoffSpeedMps: Double? = null,
    val maxCruiseThrustN: Double = 1800.0,
    val cruiseEfficiency: Double = 0.78,
    val driveThrottle: Double = 0.8,
    val maxSpeedMps: Double = 80.0,
    val maxStructuralLoadFactor: Double = 3.0,
    val durationSeconds: Double = 20.0,
    val solverStepSeconds: Double = 0.02,
    val motorFailureAtSeconds: Double? = null,
)

data class NativeWorldLabVehicleSample(
    val timeSeconds: Double,
    val distanceMeters: Double,
    val altitudeMeters: Double,
    val horizontalSpeedMps: Double,
    val verticalSpeedMps: Double,
    val wheelDriveForceN: Double,
    val cruiseThrustN: Double,
    val rotorThrustN: Double,
    val wingLiftN: Double,
    val dragN: Double,
    val normalForceN: Double,
    val loadFactor: Double,
    val batteryCurrentA: Double,
    val terminalVoltageV: Double,
    val batteryPowerW: Double,
    val batterySoc: Double,
    val batteryTemperatureK: Double,
    val motorTemperatureK: Double,
    val airborne: Boolean,
    val powerLimited: Boolean,
    val motorAvailable: Boolean,
    val energyUsedWh: Double,
)

data class NativeWorldLabVehicleRun(
    val projectId: String,
    val projectRevision: Int,
    val runId: String,
    val input: NativeWorldLabVehicleInput,
    val weightN: Double,
    val maxBatteryPowerW: Double,
    val preflight: List<String>,
    val samples: List<NativeWorldLabVehicleSample>,
    val events: List<String>,
    val outcome: String,
    val failureReasons: List<String>,
    val validity: String,
)

object NativeWorldLabVehicle {
    private const val G = 9.80665
    private const val MAX_STEPS = 12000

    private data class State(
        val x: Double = 0.0,
        val z: Double = 0.0,
        val vx: Double = 0.0,
        val vz: Double = 0.0,
        val soc: Double,
        val motorK: Double,
        val batteryK: Double,
        val energyWh: Double = 0.0,
        val airborne: Boolean = false,
        val motorFailed: Boolean = false,
        val failure: String? = null,
    )

    private data class Force(
        val wheel: Double, val cruise: Double, val rotor: Double, val wing: Double,
        val drag: Double, val normal: Double, val load: Double,
        val current: Double, val voltage: Double, val power: Double,
        val motorHeat: Double, val batteryHeat: Double,
        val limited: Boolean, val motorAvailable: Boolean, val airborne: Boolean,
    )

    private fun requireRange(value: Double, label: String, min: Double, max: Double) {
        require(value.isFinite() && value in min..max) { "$label must be finite and between $min and $max." }
    }

    fun validate(input: NativeWorldLabVehicleInput): NativeWorldLabVehicleInput {
        require(input.mode in setOf("road-only", "rotorcraft", "fixed-wing")) { "Choose a supported vehicle mode." }
        val values = listOf(
            Triple(input.massKg, "Mass (kg)", 100.0 to 30000.0),
            Triple(input.frontalAreaM2, "Frontal area (m²)", 0.2 to 50.0),
            Triple(input.dragCoefficient, "Drag coefficient", 0.05 to 2.5),
            Triple(input.airDensityKgM3, "Air density (kg/m³)", 0.2 to 2.0),
            Triple(input.rollingResistance, "Rolling resistance", 0.001 to 0.2),
            Triple(input.tireFriction, "Tire friction", 0.05 to 2.5),
            Triple(input.maxWheelForceN, "Wheel force (N)", 10.0 to 500000.0),
            Triple(input.motorMaxPowerW, "Motor power (W)", 100.0 to 50000000.0),
            Triple(input.motorEfficiency, "Motor efficiency", 0.2 to 0.99),
            Triple(input.motorForceConstantNPerA, "Motor force constant (N/A)", 0.01 to 10000.0),
            Triple(input.motorWindingResistanceOhm, "Motor resistance (Ω)", 0.0001 to 100.0),
            Triple(input.motorMaxCurrentA, "Motor current (A)", 0.1 to 10000.0),
            Triple(input.batteryVoltageV, "Battery voltage (V)", 12.0 to 2000.0),
            Triple(input.batteryResistanceOhm, "Battery resistance (Ω)", 0.0 to 10.0),
            Triple(input.batteryMaxCurrentA, "Battery current (A)", 0.1 to 20000.0),
            Triple(input.batteryCapacityWh, "Battery capacity (Wh)", 10.0 to 100000000.0),
            Triple(input.initialSoc, "Initial battery charge", 0.01 to 1.0),
            Triple(input.batteryHeatCapacityJPerK, "Battery heat capacity", 10.0 to 100000000.0),
            Triple(input.batteryCoolingWPerK, "Battery cooling", 0.0 to 100000.0),
            Triple(input.maxBatteryTemperatureK, "Battery temperature limit", 250.0 to 600.0),
            Triple(input.motorHeatCapacityJPerK, "Motor heat capacity", 10.0 to 100000000.0),
            Triple(input.motorCoolingWPerK, "Motor cooling", 0.0 to 100000.0),
            Triple(input.maxMotorTemperatureK, "Motor temperature limit", 250.0 to 800.0),
            Triple(input.ambientTemperatureK, "Ambient temperature", 180.0 to 360.0),
            Triple(input.initialMotorTemperatureK, "Initial motor temperature", 180.0 to 800.0),
            Triple(input.initialBatteryTemperatureK, "Initial battery temperature", 180.0 to 600.0),
            Triple(input.rotorThrottle, "Rotor throttle", 0.0 to 1.0),
            Triple(input.rotorEfficiency, "Rotor efficiency", 0.2 to 0.95),
            Triple(input.maxCruiseThrustN, "Cruise thrust (N)", 0.0 to 500000.0),
            Triple(input.cruiseEfficiency, "Cruise efficiency", 0.2 to 0.95),
            Triple(input.driveThrottle, "Drive throttle", 0.0 to 1.0),
            Triple(input.maxSpeedMps, "Maximum speed (m/s)", 1.0 to 300.0),
            Triple(input.maxStructuralLoadFactor, "Structural load factor", 1.0 to 20.0),
            Triple(input.durationSeconds, "Duration (s)", 0.1 to 120.0),
            Triple(input.solverStepSeconds, "Solver step (s)", 0.001 to 0.05),
        )
        values.forEach { requireRange(it.first, it.second, it.third.first, it.third.second) }
        require(ceil(input.durationSeconds / input.solverStepSeconds) <= MAX_STEPS) {
            "Vehicle run exceeds its 12,000-step local computation budget."
        }
        input.rotorDiskAreaM2?.let { requireRange(it, "Rotor disk area (m²)", 0.05, 500.0) }
        input.rotorMaxThrustN?.let { requireRange(it, "Rotor maximum thrust (N)", 10.0, 1000000.0) }
        input.wingAreaM2?.let { requireRange(it, "Wing area (m²)", 0.5, 500.0) }
        input.wingLiftCoefficient?.let { requireRange(it, "Wing lift coefficient", 0.05, 3.0) }
        input.takeoffSpeedMps?.let { requireRange(it, "Takeoff speed (m/s)", 5.0, 150.0) }
        input.motorFailureAtSeconds?.let { requireRange(it, "Motor failure time (s)", 0.0, input.durationSeconds) }
        if (input.mode == "rotorcraft") require(input.rotorDiskAreaM2 != null && input.rotorMaxThrustN != null) {
            "Rotorcraft mode requires rotor disk area and maximum thrust assumptions."
        }
        if (input.mode == "fixed-wing") require(input.wingAreaM2 != null && input.wingLiftCoefficient != null && input.takeoffSpeedMps != null) {
            "Fixed-wing mode requires wing area, lift coefficient and takeoff speed assumptions."
        }
        if (input.mode != "road-only") require(input.maxCruiseThrustN > 0.0) {
            "A flying vehicle needs assumed horizontal cruise thrust."
        }
        require(input.initialMotorTemperatureK < input.maxMotorTemperatureK &&
            input.initialBatteryTemperatureK < input.maxBatteryTemperatureK) {
            "Initial temperatures must be below the configured limits."
        }
        return input
    }

    private fun maxBatteryPower(i: NativeWorldLabVehicleInput, soc: Double, tempK: Double): Double {
        if (soc <= 0.0 || tempK >= i.maxBatteryTemperatureK) return 0.0
        val derate = if (tempK <= i.maxBatteryTemperatureK - 20.0) 1.0
            else ((i.maxBatteryTemperatureK - tempK) / 20.0).coerceIn(0.0, 1.0)
        val voc = i.batteryVoltageV * (0.9 + 0.1 * soc.coerceIn(0.0, 1.0))
        val r = i.batteryResistanceOhm
        val current = min(i.batteryMaxCurrentA * derate, if (r > 0.0) voc / (2.0 * r) else i.batteryMaxCurrentA * derate)
        return max(0.0, current * (voc - current * r))
    }

    private fun rotorPower(thrust: Double, area: Double, airDensity: Double, efficiency: Double): Double =
        if (thrust <= 0.0) 0.0 else thrust.pow(1.5) / sqrt(2.0 * airDensity * area) / efficiency

    private fun batteryCurrent(power: Double, voc: Double, resistance: Double): Double {
        if (power <= 0.0) return 0.0
        if (resistance <= 1e-12) return power / voc
        val d = voc * voc - 4.0 * resistance * power
        require(d >= -1e-6) { "Battery request exceeds its resistive discharge envelope." }
        return (voc - sqrt(max(0.0, d))) / (2.0 * resistance)
    }

    fun evaluate(projectId: String, projectRevision: Int, runId: String, raw: NativeWorldLabVehicleInput): NativeWorldLabVehicleRun {
        require(projectId.matches(Regex("^[A-Za-z0-9_-]{1,120}$")) && runId.matches(Regex("^[A-Za-z0-9_-]{1,120}$")) && projectRevision >= 0) {
            "Vehicle experiment needs a valid project ID, revision and run ID."
        }
        val i = validate(raw)
        val weight = i.massKg * G
        val maxBattery = maxBatteryPower(i, i.initialSoc, i.initialBatteryTemperatureK)
        val preflight = mutableListOf<String>()
        var hoverPower: Double? = null
        var wingLift: Double? = null
        if (i.mode == "rotorcraft") {
            hoverPower = rotorPower(weight, i.rotorDiskAreaM2!!, i.airDensityKgM3, i.rotorEfficiency)
            if (i.rotorMaxThrustN!! < weight) preflight += "BLOCKER: Maximum rotor thrust is below vehicle weight."
            if (hoverPower > maxBattery) preflight += "BLOCKER: Ideal induced hover power exceeds battery discharge capability."
            if (i.rotorMaxThrustN < weight * 1.2) preflight += "WARNING: Rotor thrust reserve is below 20%."
        }
        if (i.mode == "fixed-wing") {
            wingLift = 0.5 * i.airDensityKgM3 * i.takeoffSpeedMps!!.pow(2) * i.wingAreaM2!! * i.wingLiftCoefficient!!
            if (wingLift < weight) preflight += "BLOCKER: Wing lift at configured takeoff speed is below vehicle weight."
            val drag = 0.5 * i.airDensityKgM3 * i.dragCoefficient * i.frontalAreaM2 * i.takeoffSpeedMps.pow(2)
            if (i.maxCruiseThrustN < drag) preflight += "BLOCKER: Cruise thrust is below estimated takeoff drag."
        }
        preflight += "INFO: Level-road longitudinal point-mass model; no 6-DOF stability, suspension, detailed rotor aerodynamics or certification."
        val stepCount = ceil(i.durationSeconds / i.solverStepSeconds).toInt()
        val h = i.durationSeconds / stepCount
        var state = State(soc=i.initialSoc,motorK=i.initialMotorTemperatureK,batteryK=i.initialBatteryTemperatureK)
        val samples = ArrayList<NativeWorldLabVehicleSample>(stepCount + 1)
        val events = mutableListOf<String>()
        val failures = mutableListOf<String>()
        var lastAirborne = false
        var powerLimitAdded = false
        for (step in 0..stepCount) {
            val time = step * h
            val force = calculateForces(i, state, time, weight)
            if (force.airborne && !lastAirborne) events += "Takeoff at %.2f s.".format(time)
            if (!force.airborne && lastAirborne) events += "Touchdown at %.2f s.".format(time)
            if (force.limited && !powerLimitAdded) {
                events += "Battery current, internal resistance or power limits reduced propulsion at %.2f s.".format(time)
                powerLimitAdded = true
            }
            if (!state.motorFailed && i.motorFailureAtSeconds != null && time >= i.motorFailureAtSeconds) {
                events += "Injected motor dropout at %.2f s; powered wheel/cruise thrust disabled.".format(time)
                state = state.copy(motorFailed = true)
            }
            val speed = hypot(state.vx, state.vz)
            samples += NativeWorldLabVehicleSample(
                time, state.x, state.z, state.vx, state.vz,
                force.wheel, force.cruise, force.rotor, force.wing, force.drag,
                force.normal, force.load, force.current, force.voltage, force.power,
                state.soc, state.batteryK, state.motorK, force.airborne,
                force.limited, force.motorAvailable, state.energyWh,
            )
            if (step == stepCount || state.failure != null) break
            val dragX = if (speed > 1e-12) force.drag * state.vx / speed else 0.0
            val dragZ = if (speed > 1e-12) force.drag * state.vz / speed else 0.0
            val rolling = if (force.airborne) 0.0 else i.rollingResistance * force.normal
            val ax = (force.wheel + force.cruise - dragX - rolling) / i.massKg
            val az = if (force.airborne) (force.wing + force.rotor - weight - dragZ) / i.massKg else 0.0
            val vx = max(0.0, state.vx + ax * h)
            val vz = state.vz + az * h
            var z = state.z + (if (force.airborne) max(0.0, vz) else 0.0) * h
            var nextVz = vz
            var airborne = force.airborne
            if (z <= 1e-6 && airborne && nextVz <= 0.0) {
                z = 0.0; nextVz = 0.0; airborne = false
            }
            val motorTemp = state.motorK + (force.motorHeat - i.motorCoolingWPerK * (state.motorK - i.ambientTemperatureK)) * h / i.motorHeatCapacityJPerK
            val batteryTemp = state.batteryK + (force.batteryHeat - i.batteryCoolingWPerK * (state.batteryK - i.ambientTemperatureK)) * h / i.batteryHeatCapacityJPerK
            val energy = state.energyWh + force.power * h / 3600.0
            val soc = max(0.0, state.soc - force.power * h / (3600.0 * i.batteryCapacityWh))
            var failure: String? = null
            if (force.load > i.maxStructuralLoadFactor) {
                failure = "Computed lift load exceeded the assumed structural load-factor limit."
                events += failure
            } else if (motorTemp >= i.maxMotorTemperatureK || batteryTemp >= i.maxBatteryTemperatureK) {
                failure = "Motor or battery temperature exceeded its assumed limit."
                events += failure
            } else if (vx > i.maxSpeedMps) {
                failure = "Modeled speed exceeded the configured maximum."
                events += failure
            }
            if (failure != null) { failures += failure; state = state.copy(failure=failure) }
            else state = State(
                state.x + vx * h, z, vx, nextVz, soc, motorTemp, batteryTemp,
                energy, airborne, state.motorFailed, null,
            )
            lastAirborne = force.airborne
        }
        val final = samples.last()
        val noTakeoff = i.mode != "road-only" && samples.none { it.airborne } && failures.isEmpty()
        if (noTakeoff) failures += "The vehicle did not reach the configured takeoff/lift conditions within this recorded run."
        val outcome = when {
            state.failure != null -> "failed"
            final.airborne -> "airborne"
            i.mode == "road-only" -> "ground-run"
            else -> "unable-to-takeoff"
        }
        val validity = "Hypothetical user-assumed longitudinal reference; no suspension travel, steering/yaw/roll, tire relaxation, detailed aerodynamics, turbulence, stall, full structural FEM, flight control safety or certification."
        return NativeWorldLabVehicleRun(projectId, projectRevision, runId, i, weight, maxBattery, preflight.toList(), samples.toList(), events.toList(), outcome, failures.toList(), validity)
    }

    private fun calculateForces(i: NativeWorldLabVehicleInput, s: State, time: Double, weight: Double): Force {
        val speed = hypot(s.vx, s.vz)
        val wing = if (i.mode == "fixed-wing") 0.5 * i.airDensityKgM3 * speed * speed * i.wingAreaM2!! * i.wingLiftCoefficient!! else 0.0
        val maxPower = maxBatteryPower(i, s.soc, s.batteryK)
        val motorAvailable = s.failure == null && !s.motorFailed && (i.motorFailureAtSeconds == null || time < i.motorFailureAtSeconds)
        val rotorRequest = if (i.mode == "rotorcraft") i.rotorMaxThrustN!! * i.rotorThrottle else 0.0
        val rotorRequestPower = if (i.mode == "rotorcraft") rotorPower(rotorRequest, i.rotorDiskAreaM2!!, i.airDensityKgM3, i.rotorEfficiency) else 0.0
        val rotorScale = if (rotorRequestPower > maxPower && rotorRequestPower > 0.0) (maxPower / rotorRequestPower).pow(2.0 / 3.0) else 1.0
        val rotor = rotorRequest * rotorScale
        val rotorW = rotorPower(rotor, i.rotorDiskAreaM2 ?: 1.0, i.airDensityKgM3, i.rotorEfficiency)
        val canLift = if (i.mode == "rotorcraft") rotor + wing >= weight else i.mode == "fixed-wing" && speed >= i.takeoffSpeedMps!! && wing >= weight
        val airborne = s.airborne || canLift
        val normal = if (airborne) 0.0 else max(0.0, weight - wing - rotor)
        val drag = 0.5 * i.airDensityKgM3 * i.dragCoefficient * i.frontalAreaM2 * speed * speed
        var wheel = if (motorAvailable && !airborne) min(
            i.driveThrottle * i.maxWheelForceN,
            min(i.tireFriction * normal, min(i.motorMaxCurrentA * i.motorForceConstantNPerA, i.motorMaxPowerW * i.motorEfficiency / max(s.vx, 0.5))),
        ) else 0.0
        // Fixed-wing propellers provide thrust during the takeoff roll as well as in flight.
        // Rotorcraft horizontal cruise thrust remains flight-only; rotor thrust handles lift.
        val cruisePropulsionAvailable = i.mode == "fixed-wing" ||
            (airborne && i.mode == "rotorcraft")
        var cruise = if (motorAvailable && cruisePropulsionAvailable) i.maxCruiseThrustN * i.driveThrottle else 0.0
        val wheelP = wheel * max(s.vx, 0.5)
        val wheelI = wheel / i.motorForceConstantNPerA
        val cruiseP = cruise * max(speed, 0.5) / i.cruiseEfficiency
        val motorP = max(wheelP / i.motorEfficiency, wheelI * wheelI * i.motorWindingResistanceOhm) + cruiseP
        val remaining = max(0.0, maxPower - rotorW)
        val availableCurrent = max(0.0, min(i.motorMaxCurrentA, i.batteryMaxCurrentA) - rotorW / max(i.batteryVoltageV * 0.8, 1.0))
        val requestedCurrent = wheelI + cruiseP / max(i.batteryVoltageV * 0.8, 1.0)
        val currentScale = if (requestedCurrent > 0.0) min(1.0, availableCurrent / requestedCurrent) else 1.0
        val powerScale = if (motorP > remaining && motorP > 0.0) remaining / motorP else 1.0
        val nameplateScale = if (motorP > i.motorMaxPowerW && motorP > 0.0) i.motorMaxPowerW / motorP else 1.0
        val scale = min(currentScale, min(powerScale, nameplateScale))
        val limited = scale < 0.999999 || rotorScale < 0.999999
        wheel *= scale; cruise *= scale
        val actualWheelI = wheel / i.motorForceConstantNPerA
        val actualWheelP = wheel * max(s.vx, 0.5)
        val actualCruiseP = cruise * max(speed, 0.5) / i.cruiseEfficiency
        val copper = actualWheelI * actualWheelI * i.motorWindingResistanceOhm
        val actualMotorP = max(actualWheelP / i.motorEfficiency, copper) + actualCruiseP
        val total = min(maxPower, rotorW + actualMotorP)
        val voc = i.batteryVoltageV * (0.9 + 0.1 * s.soc.coerceIn(0.0, 1.0))
        val current = batteryCurrent(total, voc, i.batteryResistanceOhm)
        val terminal = max(0.0, voc - current * i.batteryResistanceOhm)
        val motorHeat = max(0.0, actualMotorP - actualWheelP - cruise * max(speed, 0.5))
        val batteryHeat = current * current * i.batteryResistanceOhm
        return Force(wheel, cruise, rotor, wing, drag, normal, max(0.0, (wing + rotor) / weight), current, terminal, total, motorHeat, batteryHeat, limited, motorAvailable, airborne)
    }
}

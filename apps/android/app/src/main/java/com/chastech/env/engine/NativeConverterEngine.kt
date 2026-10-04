package com.chastech.env.engine

import com.chastech.env.data.ToolRecord
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.pow

/** Native Kotlin port of src/lib/engines/units.ts. */
object NativeConverterEngine {
    data class UnitDef(
        val id: String,
        val label: String,
        val toBase: Double,
        val offset: Double = 0.0,
        val inverse: Boolean = false,
        val table: Map<Double, Double> = emptyMap(),
    )
    data class SystemDef(val id: String, val name: String, val units: List<UnitDef>)
    data class Operation(val toolId: String, val systemId: String, val mode: String)

    private val data by lazy { JSONObject(NativeEngineData.UNIT_JSON) }
    private val systems: Map<String, SystemDef> by lazy { parseSystems() }
    private val paperSizes: Map<String, Pair<String, Pair<Double, Double>>> by lazy { parsePaperSizes() }

    fun operationForTool(tool: ToolRecord): Operation? {
        if (tool.status.equals("planned", true) || tool.engine.type != "converter") return null
        val system = tool.engine.extras["system"] ?: return null
        if (!systems.containsKey(system)) return null
        return Operation(tool.id, system, tool.engine.extras["mode"] ?: "standard")
    }

    fun systemsFor(operation: Operation): List<UnitDef> = systems[operation.systemId]?.units.orEmpty()

    fun run(operation: Operation, valueText: String, from: String, to: String): String {
        val value = valueText.trim().replace(",", "").toDoubleOrNull() ?: error("Enter a valid number.")
        val system = systems[operation.systemId] ?: error("Unknown conversion system.")
        if (from.isBlank() || to.isBlank()) error("Select both units.")
        return when (operation.mode) {
            "reference", "table", "comparison", "quick" -> reference(system, operation.systemId, value, from)
            else -> format(convert(operation.systemId, value, from, to)) + " " + (system.units.firstOrNull { it.id == to }?.label ?: to)
        }
    }

    private fun reference(system: SystemDef, systemId: String, value: Double, from: String): String {
        val lines = buildList {
            add("$value ${system.units.firstOrNull { it.id == from }?.label ?: from}")
            for (unit in system.units) {
                val result = runCatching { convert(systemId, value, from, unit.id) }.getOrNull() ?: continue
                if (unit.id == from) continue
                add("${unit.label}: ${format(result)}")
            }
        }
        return lines.joinToString("\n")
    }

    private fun convert(systemId: String, value: Double, from: String, to: String): Double {
        if (from == to) return value
        if (systemId == "dpi") return convertDpi(value, from, to)
        if (systemId == "paper") {
            val fromPaper = paperSizes[from.lowercase()]
            val toPaper = paperSizes[to.lowercase()]
            return when {
                fromPaper != null && toPaper != null -> toPaper.second.first
                fromPaper != null -> fromPaper.second.first * value
                else -> Double.NaN
            }
        }
        val system = systems[systemId] ?: error("Unknown system: $systemId")
        val fromUnit = system.units.firstOrNull { it.id.equals(from, true) } ?: error("Unknown unit: $from")
        val toUnit = system.units.firstOrNull { it.id.equals(to, true) } ?: error("Unknown unit: $to")
        val base = toBase(fromUnit, value)
        return fromBase(toUnit, base)
    }

    private fun toBase(unit: UnitDef, value: Double): Double {
        if (unit.inverse) {
            if (value == 0.0) return Double.NaN
            return unit.toBase / value
        }
        if (unit.toBase == 0.0 && unit.table.isNotEmpty()) return tableToBase(unit.table, value)
        return (value + unit.offset) * if (unit.toBase == 0.0) 1.0 else unit.toBase
    }

    private fun fromBase(unit: UnitDef, base: Double): Double {
        if (unit.inverse) {
            if (base == 0.0) return Double.NaN
            return unit.toBase / base
        }
        if (unit.toBase == 0.0 && unit.table.isNotEmpty()) return tableFromBase(unit.table, base)
        return base / if (unit.toBase == 0.0) 1.0 else unit.toBase - unit.offset
    }

    private fun tableToBase(table: Map<Double, Double>, value: Double): Double {
        table[value]?.let { return it }
        val entries = table.toList().sortedBy { it.first }
        if (entries.isEmpty()) return value
        if (value <= entries.first().first) return entries.first().second
        if (value >= entries.last().first) return entries.last().second
        for (i in 1 until entries.size) {
            val (x0, y0) = entries[i - 1]
            val (x1, y1) = entries[i]
            if (value <= x1) {
                val t = (value - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
            }
        }
        return entries.last().second
    }

    private fun tableFromBase(table: Map<Double, Double>, base: Double): Double {
        val entries = table.toList().sortedBy { it.second }
        if (entries.isEmpty()) return base
        if (base <= entries.first().second) return entries.first().first
        if (base >= entries.last().second) return entries.last().first
        for (i in 1 until entries.size) {
            val (x0, y0) = entries[i - 1]
            val (x1, y1) = entries[i]
            if (base <= y1) {
                val span = y1 - y0
                val t = if (span == 0.0) 0.0 else (base - y0) / span
                return x0 + t * (x1 - x0)
            }
        }
        return entries.last().first
    }

    private fun convertDpi(value: Double, from: String, to: String): Double {
        val fromId = from.lowercase(); val toId = to.lowercase()
        val inches = when (fromId) {
            "in" -> value
            "mm" -> value / 25.4
            "px" -> value / 96.0
            "dpi" -> if (toId == "dpi") return value else return Double.NaN
            else -> return Double.NaN
        }
        return when (toId) {
            "in" -> inches; "mm" -> inches * 25.4; "px" -> inches * 96.0; "dpi" -> 96.0; else -> Double.NaN
        }
    }

    private fun format(value: Double): String {
        if (!value.isFinite()) return "—"
        val absValue = abs(value)
        if (absValue != 0.0 && (absValue < 1e-6 || absValue >= 1e10)) return "%.6e".format(java.util.Locale.US, value).replace(Regex("\\.?0+e"), "e")
        return if (absValue >= 1e6) "%.8g".format(java.util.Locale.US, value) else "%.10g".format(java.util.Locale.US, value)
    }

    private fun parseSystems(): Map<String, SystemDef> {
        val raw = data.getJSONObject("systems")
        return raw.keys().asSequence().associateWith { key ->
            val obj = raw.getJSONObject(key)
            val units = obj.getJSONArray("units").let { array ->
                buildList(array.length()) {
                    for (i in 0 until array.length()) {
                        val u = array.getJSONObject(i)
                        val table = mutableMapOf<Double, Double>()
                        u.optJSONObject("table")?.let { tableObj ->
                            tableObj.keys().forEach { k -> table[k.toDouble()] = tableObj.getDouble(k) }
                        }
                        add(UnitDef(u.getString("id"), u.getString("label"), u.optDouble("toBase", 0.0), u.optDouble("offset", 0.0), u.optBoolean("inverse", false), table))
                    }
                }
            }
            SystemDef(obj.getString("id"), obj.getString("name"), units)
        }
    }

    private fun parsePaperSizes(): Map<String, Pair<String, Pair<Double, Double>>> {
        val raw = data.getJSONObject("paperSizes")
        return raw.keys().asSequence().associate { key ->
            val obj = raw.getJSONObject(key)
            key.lowercase() to (obj.getString("name") to (obj.getDouble("widthMm") to obj.getDouble("heightMm")))
        }
    }
}

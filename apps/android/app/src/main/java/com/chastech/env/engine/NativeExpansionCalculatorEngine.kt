package com.chastech.env.engine

import org.json.JSONObject

/** Native port of the exact catalog math-expansion calculator family. */
object NativeExpansionCalculatorEngine {
    data class Row(val family: String, val key: String, val aLabel: String, val bLabel: String, val cLabel: String)
    data class Operation(val id: String, val row: Row, val target: Char)

    private val rows by lazy { parseRows() }
    private val operations by lazy {
        buildMap {
            rows.values.flatten().forEach { row ->
                "abc".forEach { target ->
                    put("math-exp-${row.family}-${row.key}-$target", Operation("math-exp-${row.family}-${row.key}-$target", row, target))
                }
            }
        }
    }

    fun operationForTool(id: String): Operation? = operations[id]
    fun supportedToolIds(): Set<String> = operations.keys

    fun run(op: Operation, values: Map<Char, String>): Pair<String, Double> {
        fun v(c: Char): Double = NativeNumberParser.parse(values[c], label(op.row, c))
        return when (op.row.family) {
            "product" -> when (op.target) {
                'a' -> op.row.aLabel to v('c') / v('b')
                'b' -> op.row.bLabel to v('c') / v('a')
                else -> op.row.cLabel to v('a') * v('b')
            }
            "sum" -> when (op.target) {
                'a' -> op.row.aLabel to v('c') - v('b')
                'b' -> op.row.bLabel to v('c') - v('a')
                else -> op.row.cLabel to v('a') + v('b')
            }
            "ratio" -> when (op.target) {
                'a' -> op.row.aLabel to v('c') * v('b')
                'b' -> op.row.bLabel to v('a') / v('c')
                else -> op.row.cLabel to v('a') / v('b')
            }
            else -> error("Unsupported expansion family: ${op.row.family}")
        }
    }

    private fun label(row: Row, c: Char) = when (c) { 'a' -> row.aLabel; 'b' -> row.bLabel; else -> row.cLabel }

    private fun parseRows(): Map<String, List<Row>> {
        val root = JSONObject(NativeEngineData.EXPANSION_JSON)
        return root.keys().asSequence().associateWith { family ->
            root.getJSONArray(family).let { arr ->
                buildList(arr.length()) {
                    for (i in 0 until arr.length()) {
                        val row = arr.getJSONArray(i)
                        // Rows are [key, a, b, c] or [key, title, a, b, c].
                        val offset = if (row.length() >= 5) 1 else 0
                        add(Row(family, row.getString(0), row.getString(1 + offset), row.getString(2 + offset), row.getString(3 + offset)))
                    }
                }
            }
        }
    }
}

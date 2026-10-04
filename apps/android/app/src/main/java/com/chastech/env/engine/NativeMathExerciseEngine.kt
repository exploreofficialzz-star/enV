package com.chastech.env.engine

import org.json.JSONObject
import kotlin.math.*

/** Native executor for all reusable math-exercise formulas emitted by the web engine. */
object NativeMathExerciseEngine {
    data class Field(val name: String, val label: String)
    data class Operation(val id: String, val specKey: String, val target: String, val name: String, val formula: String, val fields: List<Field>, val label: String, val kind: String, val expression: String?)

    private val operations by lazy { parseOperations() }
    fun operationForTool(id: String): Operation? = operations[id]
    fun supportedToolIds(): Set<String> = operations.keys

    fun run(op: Operation, values: Map<String, Double>): Pair<String, Double> {
        val result = if (op.kind == "expression") ExpressionParser(op.expression ?: "", values).parse() else runComplex(op, values)
        if (!result.isFinite()) error("The formula produced an undefined result.")
        return op.label to result
    }

    private fun runComplex(op: Operation, v: Map<String, Double>): Double = when (op.specKey) {
        "geometric-sum" -> { val r = v.req("r"); val a = v.req("a"); val n = v.req("n"); if (abs(r - 1.0) < 1e-12) a * n else a * (r.pow(n) - 1.0) / (r - 1.0) }
        "binomial-probability" -> { val n = v.req("n").roundToInt(); val k = v.req("k").roundToInt(); val p = v.req("p"); var c = 1.0; for (i in 1..k) c *= (n - k + i).toDouble() / i; c * p.pow(k) * (1 - p).pow(n - k) }
        "cylinder-surface-area" -> { val h = v.req("h"); val A = v.req("A"); (-2 * PI * h + sqrt((2 * PI * h).pow(2) + 8 * PI * A)) / (4 * PI) }
        "heron-area" -> { val a = v.req("a"); val b = v.req("b"); val c = v.req("c"); val s = (a + b + c) / 2; sqrt(s * (s - a) * (s - b) * (s - c)) }
        "permutation" -> { var r = 1.0; repeat(v.req("r").roundToInt()) { i -> r *= v.req("n") - i }; r }
        "combination" -> { val n = v.req("n").roundToInt(); var r = v.req("r").roundToInt(); if (r > n) error("r cannot exceed n."); r = min(r, n - r); var c = 1.0; for (i in 1..r) c *= (n - r + i).toDouble() / i; c }
        "kinematic-displacement" -> { val u = v.req("u"); val a = v.req("a"); val s = v.req("s"); (-u + sqrt(u * u + 2 * a * s)) / a }
        else -> error("Unsupported exercise formula: ${op.specKey}")
    }

    private fun parseOperations(): Map<String, Operation> {
        val specs = JSONObject(NativeEngineData.EXERCISE_JSON).getJSONArray("specs")
        val result = mutableMapOf<String, Operation>()
        for (i in 0 until specs.length()) {
            val s = specs.getJSONObject(i)
            val key = s.getString("key")
            val name = s.getString("name")
            val formula = s.getString("formula")
            val labels = s.getJSONObject("labels")
            val fieldsArray = s.getJSONArray("fields")
            val allFields = buildList(fieldsArray.length()) { for (j in 0 until fieldsArray.length()) { val f = fieldsArray.getJSONObject(j); add(Field(f.getString("name"), f.getString("label"))) } }
            val solves = s.getJSONObject("solves")
            solves.keys().forEach { target ->
                val solve = solves.getJSONObject(target)
                val id = "math-exercise-$key-$target"
                result[id] = Operation(id, key, target, name, formula, allFields.filter { it.name != target }, labels.optString(target, target), solve.getString("kind"), solve.optString("expression", null))
            }
        }
        return result
    }

    private fun Map<String, Double>.req(key: String): Double = this[key] ?: error("Enter a value for $key.")

    private class ExpressionParser(private val source: String, private val vars: Map<String, Double>) {
        private var index = 0
        fun parse(): Double { val value = expression(); skip(); if (index != source.length) error("Unsupported formula expression near: ${source.substring(index)}"); return value }
        private fun expression(): Double { var x = term(); while (true) { skip(); x = when { eat('+') -> x + term(); eat('-') -> x - term(); else -> return x } } }
        private fun term(): Double { var x = power(); while (true) { skip(); x = when { eat('*') -> x * power(); eat('/') -> x / power(); eat('%') -> x % power(); else -> return x } } }
        private fun power(): Double { var x = unary(); skip(); if (match("**")) { x = x.pow(unary()) } else if (eat('^')) { x = x.pow(unary()) }; return x }
        private fun unary(): Double { skip(); if (eat('+')) return unary(); if (eat('-')) return -unary(); return primary() }
        private fun primary(): Double {
            skip()
            if (eat('(')) { val x = expression(); expect(')'); return x }
            if (index < source.length && (source[index].isDigit() || source[index] == '.')) return number()
            val name = identifier()
            if (name.isNotEmpty()) {
                skip()
                if (eat('(')) { val args = mutableListOf<Double>(); skip(); if (!eat(')')) { do { args += expression() } while (eat(',')); expect(')') }; return function(name, args) }
                return vars[name] ?: when (name) { "PI" -> PI; "E" -> E; else -> error("Unknown formula variable: $name") }
            }
            error("Expected a number, variable, or function")
        }
        private fun number(): Double { val start = index; while (index < source.length && (source[index].isDigit() || source[index] == '.')) index++; if (index < source.length && (source[index] == 'e' || source[index] == 'E')) { index++; if (index < source.length && (source[index] == '+' || source[index] == '-')) index++; while (index < source.length && source[index].isDigit()) index++ }; return source.substring(start, index).toDouble() }
        private fun identifier(): String { skip(); val start = index; while (index < source.length && (source[index].isLetterOrDigit() || source[index] == '_' || source[index] == '$')) index++; return source.substring(start, index) }
        private fun function(name: String, a: List<Double>): Double = when (name) {
            "sqrt" -> sqrt(a.one()); "cbrt" -> cbrt(a.one()); "abs" -> abs(a.one()); "acos" -> acos(a.one()); "asin" -> asin(a.one()); "cos" -> cos(a.one()); "sin" -> sin(a.one()); "exp" -> exp(a.one()); "log" -> ln(a.one()); "round" -> round(a.one()); "pow" -> a[0].pow(a[1]); "hypot" -> hypot(a[0], a[1]); "min" -> a.minOrNull() ?: error("min() needs arguments"); "max" -> a.maxOrNull() ?: error("max() needs arguments"); else -> error("Unsupported math function: $name")
        }
        private fun List<Double>.one() = single()
        private fun skip() { while (index < source.length && source[index].isWhitespace()) index++ }
        private fun eat(c: Char): Boolean { skip(); if (index < source.length && source[index] == c) { index++; return true }; return false }
        private fun match(s: String): Boolean { skip(); if (source.startsWith(s, index)) { index += s.length; return true }; return false }
        private fun expect(c: Char) { if (!eat(c)) error("Expected '$c'") }
    }
}

package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.*

/** Native executor for the reusable math-exercise formulas, including the web engine's
 * multi-solution and domain-validation rules. */
object NativeMathExerciseEngine {
    data class Field(val name: String, val label: String)
    data class Output(val label: String, val value: String, val hint: String? = null, val primary: Boolean = false)
    data class Operation(
        val id: String,
        val specKey: String,
        val target: String,
        val name: String,
        val formula: String,
        val fields: List<Field>,
        val label: String,
        val kind: String,
        val expression: String?,
        val allTargets: Set<String>,
        val hasCheck: Boolean,
    )

    private val operations by lazy { parseOperations() }
    fun operationForTool(id: String): Operation? = operations[id]
    fun supportedToolIds(): Set<String> = operations.keys

    fun run(op: Operation, values: Map<String, String>): List<Output> {
        validateDomain(op, values)
        if (op.target in op.allTargets) return runAll(op, values)
        val result = scalar(op, values)
        if (!result.isFinite()) error("The formula produced an undefined result.")
        return listOf(Output(op.label, NativeNumberParser.format(result), primary = true))
    }

    private fun scalar(op: Operation, v: Map<String, String>): Double {
        if (op.specKey == "compound-growth" && op.target == "n") {
            return compoundingPeriods(req(v, "A"), req(v, "P"), req(v, "r"), req(v, "t"))
        }
        return if (op.kind == "expression") {
            ExpressionParser(op.expression ?: "", v).parse()
        } else {
            runComplex(op, v)
        }
    }

    private fun runAll(op: Operation, v: Map<String, String>): List<Output> = when (op.specKey) {
        "compound-growth" -> {
            val periods = compoundingPeriods(req(v, "A"), req(v, "P"), req(v, "r"), req(v, "t"))
            val base = mutableListOf(Output("Periods/year", NativeNumberParser.format(periods), primary = true, hint = "real-valued solution, found numerically"))
            val whole = max(1, periods.roundToInt())
            if (abs(periods - whole) > 1e-6) {
                base += Output("Nearest whole number of periods/year", whole.toString())
                val P = req(v, "P"); val r = req(v, "r"); val t = req(v, "t")
                base += Output("Final amount with that whole number", NativeNumberParser.format(P * (1 + r / whole).pow(whole * t)), hint = "for comparison")
            }
            base
        }
        "quadratic-root" -> quadraticOutputs(v)
        "law-of-sines" -> lawOfSinesOutputs(op.target, v)
        "law-of-cosines" -> lawOfCosinesOutputs(op.target, v)
        "percent-error" -> percentErrorOutputs(op.target, v)
        "vector-magnitude" -> signedRootOutputs(if (op.target == "x") "x component" else "y component", if (op.target == "x") req(v, "mag").pow(2) - req(v, "y").pow(2) else req(v, "mag").pow(2) - req(v, "x").pow(2))
        "kinematic-final-velocity" -> signedRootOutputs(if (op.target == "v") "Final velocity" else "Initial velocity", if (op.target == "v") req(v, "u").pow(2) + 2 * req(v, "a") * req(v, "s") else req(v, "v").pow(2) - 2 * req(v, "a") * req(v, "s"))
        else -> listOf(Output(op.label, NativeNumberParser.format(scalar(op, v)), primary = true))
    }

    private fun quadraticOutputs(v: Map<String, String>): List<Output> {
        val a = req(v, "a"); val b = req(v, "b"); val c = req(v, "c")
        if (a == 0.0) error("Coefficient a must not be 0: with a = 0 the equation is linear, not quadratic.")
        val d = b * b - 4 * a * c
        if (d < 0) {
            val re = -b / (2 * a); val im = sqrt(-d) / (2 * abs(a))
            return listOf(
                Output("Root x₁", "${fmt(re)} + ${fmt(im)}i", primary = true, hint = "complex roots — no real solution (discriminant b² − 4ac = ${fmt(d)})"),
                Output("Root x₂", "${fmt(re)} − ${fmt(im)}i", hint = "complex conjugate"),
            )
        }
        val root = sqrt(d)
        if (d == 0.0) return listOf(Output("Root x (double root)", fmt(-b / (2 * a)), primary = true, hint = "discriminant b² − 4ac = 0"))
        val q = -(b + if (b < 0) -root else root) / 2
        if (q == 0.0) return listOf(Output("Root x", "0", primary = true))
        val plus = if (b < 0) q / a else c / q
        val minus = if (b < 0) c / q else q / a
        return listOf(
            Output("Root x₁", fmt(plus), primary = true, hint = "(−b + √D) / 2a · discriminant b² − 4ac = ${fmt(d)}"),
            Output("Root x₂", fmt(minus), hint = "(−b − √D) / 2a"),
        )
    }

    private fun lawOfSinesOutputs(target: String, v: Map<String, String>): List<Output> {
        val opposite = if (target == "A") "a" else "b"
        val side = if (target == "A") "b" else "a"
        val knownAngle = if (target == "A") "B" else "A"
        val sine = req(v, opposite) * sin(Math.toRadians(req(v, knownAngle))) / req(v, side)
        if (sine > 1 + 1e-12) error("No triangle exists: these sides and angle $knownAngle would need sin $target = ${fmt(sine)}, which is greater than 1.")
        val acute = Math.toDegrees(asin(min(1.0, sine)))
        val known = req(v, knownAngle)
        val angles = listOf(acute, 180 - acute).filter { it > 0 && it + known < 180 - 1e-9 }.distinctBy { (it * 1e9).roundToLong() }
        if (angles.isEmpty()) error("No triangle exists: angle $target plus angle $knownAngle would be 180° or more.")
        return angles.mapIndexed { i, x -> Output("Angle $target${if (angles.size > 1) " (${if (i == 0) "acute" else "obtuse"})" else ""}", fmt(x), primary = i == 0, hint = if (angles.size > 1) "degrees · two triangles fit (side-side-angle case)" else "degrees") }
    }

    private fun lawOfCosinesOutputs(target: String, v: Map<String, String>): List<Output> {
        if (target == "C") {
            val a = positiveSide(v, "a"); val b = positiveSide(v, "b"); val c = positiveSide(v, "c")
            val cosine = (a * a + b * b - c * c) / (2 * a * b)
            if (cosine !in -1.0..1.0) error("These sides cannot form a triangle: $a, $b and $c break the triangle inequality.")
            return listOf(Output("Angle C", fmt(Math.toDegrees(acos(cosine))), primary = true, hint = "degrees"))
        }
        val known = if (target == "a") positiveSide(v, "b") else positiveSide(v, "a")
        val c = positiveSide(v, "c")
        val angle = Math.toRadians(req(v, "C"))
        val height = known * sin(angle)
        val discriminant = c * c - height * height
        if (discriminant < 0) error("No triangle exists: side c ($c) is shorter than the perpendicular height ${fmt(height)}.")
        val root = sqrt(discriminant)
        val base = known * cos(angle)
        val sides = listOf(base + root, base - root).filter { it > 0 }.distinctBy { (it * 1e9).roundToLong() }
        if (sides.isEmpty()) error("No triangle exists with these measurements.")
        return sides.mapIndexed { i, x -> Output("Side $target${if (sides.size > 1) " (solution ${i + 1})" else ""}", fmt(x), primary = i == 0, hint = if (sides.size > 1) "two triangles fit these measurements (side-side-angle case)" else null) }
    }

    private fun percentErrorOutputs(target: String, v: Map<String, String>): List<Output> {
        val e = req(v, "error")
        if (e < 0) error("Percent error must be 0 or greater: it is an absolute value.")
        if (target == "experimental") {
            val accepted = req(v, "accepted")
            if (accepted == 0.0) error("Accepted value must not be 0: percent error divides by it.")
            return listOf(accepted * (1 + e / 100), accepted * (1 - e / 100)).distinctBy { (it * 1e9).roundToLong() }.mapIndexed { i, x -> Output("Experimental (${if (x > accepted) "above" else "below"} accepted)", fmt(x), primary = i == 0) }
        }
        val experimental = req(v, "experimental")
        val candidates = listOf(experimental / (1 + e / 100), if (e == 100.0) Double.NaN else experimental / (1 - e / 100))
            .filter { it.isFinite() && it != 0.0 }
            .filter { abs(abs(experimental - it) / abs(it) * 100 - e) <= 1e-8 * max(1.0, abs(e)) }
            .distinctBy { (it * 1e9).roundToLong() }
        if (candidates.isEmpty()) error("No accepted value gives that percent error for this experimental value. Check the experimental value and the percent error.")
        return candidates.mapIndexed { i, x -> Output(if (candidates.size > 1) "Accepted (solution ${i + 1})" else "Accepted", fmt(x), primary = i == 0) }
    }

    private fun signedRootOutputs(label: String, radicand: Double): List<Output> {
        if (radicand < 0) error("No real ${label.lowercase()} exists: the square-root radicand is ${fmt(radicand)} and is negative.")
        val root = sqrt(radicand)
        if (root == 0.0) return listOf(Output(label, "0", primary = true))
        return listOf(Output("$label (+)", fmt(root), primary = true, hint = "positive direction"), Output("$label (−)", fmt(-root), hint = "negative direction"))
    }

    private fun validateDomain(op: Operation, v: Map<String, String>) {
        if (!op.hasCheck) return
        when (op.specKey) {
            "pythagorean" -> if (op.target != "c") {
                val other = if (op.target == "a") "b" else "a"
                if (!(req(v, "c") > req(v, other))) error("The hypotenuse must be longer than leg $other.")
            }
            "snell" -> {
                for (name in listOf("n1", "n2")) if (name != op.target && !(req(v, name) > 0)) error("Refractive indices must be greater than 0.")
                for (name in listOf("theta1", "theta2")) if (name != op.target) {
                    val angle = req(v, name); if (angle !in 0.0..90.0) error("Angles are measured from the normal and must be between 0° and 90°.")
                }
                if (op.target == "theta1" || op.target == "theta2") {
                    val sine = if (op.target == "theta1") req(v, "n2") * sin(Math.toRadians(req(v, "theta2"))) / req(v, "n1") else req(v, "n1") * sin(Math.toRadians(req(v, "theta1"))) / req(v, "n2")
                    if (sine > 1) error("Total internal reflection: sin θ would be ${fmt(sine)} (greater than 1), so no refracted ray exists.")
                }
            }
            "law-of-sines" -> for (name in listOf("A", "B")) if (name != op.target) {
                val angle = req(v, name); if (!(angle > 0 && angle < 180)) error("Angle $name must be greater than 0° and less than 180°.")
            }
            "law-of-cosines" -> if (op.target != "C") {
                val angle = req(v, "C"); if (!(angle > 0 && angle < 180)) error("Angle C must be greater than 0° and less than 180°.")
            }
            "scientific-notation" -> if (op.target == "e") {
                if (!(req(v, "x") / req(v, "m") > 0)) error("Number and mantissa must be non-zero and have the same sign to solve for the exponent.")
            }
            "log-product" -> {
                val base = req(v, "a")
                if (!(base > 0) || base == 1.0) error("Base must be greater than 0 and not equal to 1.")
                if (!(req(v, "x") > 0) || !(req(v, "y") > 0)) error("x and y must both be greater than 0 for a real logarithm.")
            }
        }
    }

    private fun runComplex(op: Operation, v: Map<String, String>): Double = when (op.specKey) {
        "geometric-sum" -> { val r = req(v, "r"); val a = req(v, "a"); val n = req(v, "n"); if (abs(r - 1.0) < 1e-12) a * n else a * (r.pow(n) - 1.0) / (r - 1.0) }
        "binomial-probability" -> { val n = req(v, "n").roundToInt(); val k = req(v, "k").roundToInt(); val p = req(v, "p"); var c = 1.0; for (i in 1..k) c *= (n - k + i).toDouble() / i; c * p.pow(k) * (1 - p).pow(n - k) }
        "cylinder-surface-area" -> { val h = req(v, "h"); val A = req(v, "A"); (-2 * PI * h + sqrt((2 * PI * h).pow(2) + 8 * PI * A)) / (4 * PI) }
        "heron-area" -> { val a = req(v, "a"); val b = req(v, "b"); val c = req(v, "c"); val s = (a + b + c) / 2; sqrt(s * (s - a) * (s - b) * (s - c)) }
        "permutation" -> { var r = 1.0; repeat(req(v, "r").roundToInt()) { i -> r *= req(v, "n") - i }; r }
        "combination" -> { val n = req(v, "n").roundToInt(); var r = req(v, "r").roundToInt(); if (r > n) error("r cannot exceed n."); r = min(r, n - r); var c = 1.0; for (i in 1..r) c *= (n - r + i).toDouble() / i; c }
        "kinematic-displacement" -> { val u = req(v, "u"); val a = req(v, "a"); val s = req(v, "s"); (-u + sqrt(u * u + 2 * a * s)) / a }
        else -> error("Unsupported exercise formula: ${op.specKey}")
    }

    private fun compoundingPeriods(A: Double, P: Double, r: Double, t: Double): Double {
        if (!(A > 0) || !(P > 0)) error("Final amount and initial amount must both be greater than 0.")
        if (!(t > 0)) error("Years must be greater than 0.")
        if (r == 0.0) error("With a rate of 0 the amount never changes, so the compounding frequency cannot be determined.")
        val target = ln(A / P) / t
        val limit = r
        val attainable = if (r > 0) target > 0 && target < limit else target < limit
        if (!attainable) error("No compounding frequency gives that result for the supplied rate and amounts.")
        fun h(periods: Double) = periods * ln(1 + r / periods)
        var lo = if (r > 0) 1e-9 else -r * (1 + 1e-12)
        var hi = 1e12
        if (h(hi) < target) error("The frequency exceeds 10¹² periods per year.")
        repeat(300) {
            val mid = sqrt(lo * hi)
            if (h(mid) < target) lo = mid else hi = mid
        }
        return sqrt(lo * hi)
    }

    private fun req(v: Map<String, String>, key: String): Double = NativeNumberParser.parse(v[key], key)
    private fun positiveSide(v: Map<String, String>, key: String): Double = req(v, key).also { if (it <= 0) error("Side $key must be greater than 0.") }
    private fun fmt(x: Double): String = NativeNumberParser.format(x)

    private fun parseOperations(): Map<String, Operation> {
        val specs = JSONObject(NativeEngineData.EXERCISE_JSON).getJSONArray("specs")
        val result = mutableMapOf<String, Operation>()
        for (i in 0 until specs.length()) {
            val s = specs.getJSONObject(i)
            val key = s.getString("key"); val name = s.getString("name"); val formula = s.getString("formula")
            val labels = s.getJSONObject("labels")
            val allTargets = buildSet {
                val array = s.optJSONArray("allTargets") ?: JSONArray()
                for (j in 0 until array.length()) add(array.getString(j))
            }
            val fieldsArray = s.getJSONArray("fields")
            val allFields = buildList(fieldsArray.length()) { for (j in 0 until fieldsArray.length()) { val f = fieldsArray.getJSONObject(j); add(Field(f.getString("name"), f.getString("label"))) } }
            val solves = s.getJSONObject("solves")
            solves.keys().forEach { target ->
                val solve = solves.getJSONObject(target)
                val id = "math-exercise-$key-$target"
                result[id] = Operation(id, key, target, name, formula, allFields.filter { it.name != target }, labels.optString(target, target), solve.getString("kind"), solve.optString("expression", null), allTargets, s.optBoolean("hasCheck", false))
            }
        }
        return result
    }

    private class ExpressionParser(private val source: String, private val vars: Map<String, String>) {
        private var index = 0
        fun parse(): Double { val value = expression(); skip(); if (index != source.length) error("Unsupported formula expression near: ${source.substring(index)}"); return value }
        private fun expression(): Double { var x = term(); while (true) { skip(); x = when { eat('+') -> x + term(); eat('-') -> x - term(); else -> return x } } }
        private fun term(): Double { var x = power(); while (true) { skip(); x = when { eat('*') -> x * power(); eat('/') -> x / power(); eat('%') -> x % power(); else -> return x } } }
        private fun power(): Double { var x = unary(); skip(); if (match("**")) x = x.pow(unary()) else if (eat('^')) x = x.pow(unary()); return x }
        private fun unary(): Double { skip(); if (eat('+')) return unary(); if (eat('-')) return -unary(); return primary() }
        private fun primary(): Double {
            skip(); if (eat('(')) { val x = expression(); expect(')'); return x }
            if (index < source.length && (source[index].isDigit() || source[index] == '.')) return number()
            val name = identifier(); if (name.isNotEmpty()) { skip(); if (eat('(')) { val args = mutableListOf<Double>(); skip(); if (!eat(')')) { do { args += expression() } while (eat(',')); expect(')') }; return function(name, args) }; return if (name == "PI") PI else if (name == "E") E else NativeNumberParser.parse(vars[name], name) }
            error("Expected a number, variable, or function")
        }
        private fun number(): Double { val start = index; while (index < source.length && (source[index].isDigit() || source[index] == '.')) index++; if (index < source.length && (source[index] == 'e' || source[index] == 'E')) { index++; if (index < source.length && (source[index] == '+' || source[index] == '-')) index++; while (index < source.length && source[index].isDigit()) index++ }; return source.substring(start, index).toDouble() }
        private fun identifier(): String { skip(); val start = index; while (index < source.length && (source[index].isLetterOrDigit() || source[index] == '_' || source[index] == '$')) index++; return source.substring(start, index) }
        private fun function(name: String, a: List<Double>): Double = when (name) {
            "sqrt" -> sqrt(a.single()); "cbrt" -> cbrt(a.single()); "abs" -> abs(a.single()); "acos" -> acos(a.single()); "asin" -> asin(a.single()); "cos" -> cos(a.single()); "sin" -> sin(a.single()); "exp" -> exp(a.single()); "log" -> ln(a.single()); "log10" -> log10(a.single()); "round" -> round(a.single()); "pow" -> a[0].pow(a[1]); "hypot" -> hypot(a[0], a[1]); "min" -> a.minOrNull() ?: error("min() needs arguments"); "max" -> a.maxOrNull() ?: error("max() needs arguments"); else -> error("Unsupported math function: $name")
        }
        private fun List<Double>.single() = singleOrNull() ?: error("Function requires one argument")
        private fun skip() { while (index < source.length && source[index].isWhitespace()) index++ }
        private fun eat(c: Char): Boolean { skip(); if (index < source.length && source[index] == c) { index++; return true }; return false }
        private fun match(s: String): Boolean { skip(); if (source.startsWith(s, index)) { index += s.length; return true }; return false }
        private fun expect(c: Char) { if (!eat(c)) error("Expected '$c'") }
    }
}

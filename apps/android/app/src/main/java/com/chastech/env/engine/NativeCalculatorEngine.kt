package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.abs
import kotlin.math.pow

/** Native port of the remaining expression-only web calculators. */
object NativeCalculatorEngine {
    data class Field(
        val name: String,
        val label: String,
        val defaultValue: String = "",
        val suffix: String? = null,
        val hint: String? = null,
        val placeholder: String? = null,
    )

    data class Output(val label: String, val value: String, val hint: String? = null, val primary: Boolean = false)
    data class Operation(val id: String, val formula: String?, val fields: List<Field>, val outputs: List<OutputSpec>)

    sealed interface Expr {
        data class Const(val value: Double) : Expr
        data class Value(val name: String, val validator: String, val label: String?) : Expr
        data class Validate(val validator: String, val arg: Expr, val label: String?) : Expr
        data class Binary(val op: String, val left: Expr, val right: Expr) : Expr
        data class Unary(val op: String, val arg: Expr) : Expr
        data class Call(val name: String, val args: List<Expr>) : Expr
        data class Template(val parts: List<Any>) : Expr
        data class StringValue(val value: String) : Expr
    }

    data class OutputSpec(
        val label: String,
        val value: Expr,
        val primary: Boolean,
        val hint: String?,
    )

    private sealed interface Eval {
        data class NumberValue(val value: Double) : Eval
        data class TextValue(val value: String) : Eval
    }

    private val operations: Map<String, Operation> by lazy { parseOperations() }
    private val numberFormat: DecimalFormat by lazy {
        DecimalFormat("#,##0.########", DecimalFormatSymbols(Locale.getDefault())).apply {
            isGroupingUsed = true
        }
    }

    fun operationForTool(id: String): Operation? = operations[id]
    fun supportedToolIds(): Set<String> = operations.keys

    fun run(op: Operation, values: Map<String, String>): List<Output> {
        return op.outputs.map { spec ->
            when (val value = eval(spec.value, values)) {
                is Eval.NumberValue -> Output(spec.label, formatNumber(value.value), spec.hint, spec.primary)
                is Eval.TextValue -> Output(spec.label, value.value, spec.hint, spec.primary)
            }
        }
    }

    private fun eval(expr: Expr, values: Map<String, String>): Eval = when (expr) {
        is Expr.Const -> Eval.NumberValue(expr.value)
        is Expr.StringValue -> Eval.TextValue(expr.value)
        is Expr.Value -> Eval.NumberValue(validate(expr.validator, parseNumber(values[expr.name], expr.label ?: expr.name), expr.label ?: expr.name))
        is Expr.Validate -> {
            val inner = asNumber(eval(expr.arg, values))
            Eval.NumberValue(validate(expr.validator, inner, expr.label ?: "value"))
        }
        is Expr.Unary -> {
            val value = asNumber(eval(expr.arg, values))
            Eval.NumberValue(if (expr.op == "-") -value else value)
        }
        is Expr.Binary -> {
            val left = asNumber(eval(expr.left, values))
            val right = asNumber(eval(expr.right, values))
            Eval.NumberValue(
                when (expr.op) {
                    "+" -> left + right
                    "-" -> left - right
                    "*" -> left * right
                    "/" -> left / right
                    "**" -> left.pow(right)
                    else -> error("Unsupported calculator operator ${expr.op}")
                }
            )
        }
        is Expr.Call -> when (expr.name) {
            "gcd" -> {
                require(expr.args.size == 2) { "gcd() requires two values." }
                val a = asNumber(eval(expr.args[0], values))
                val b = asNumber(eval(expr.args[1], values))
                Eval.NumberValue(gcd(a, b).toDouble())
            }
            else -> error("Unsupported calculator function ${expr.name}")
        }
        is Expr.Template -> Eval.TextValue(buildString {
            for (part in expr.parts) {
                when (part) {
                    is String -> append(part)
                    is Expr -> append(jsString(asNumber(eval(part, values))))
                }
            }
        })
    }

    private fun asNumber(value: Eval): Double = when (value) {
        is Eval.NumberValue -> value.value
        is Eval.TextValue -> value.value.toDoubleOrNull() ?: error("Expected a numeric result.")
    }

    private fun parseNumber(raw: String?, label: String): Double {
        val cleaned = raw.orEmpty().replace(",", "").trim()
        if (cleaned.isEmpty()) error("Enter a valid $label.")
        val value = cleaned.toDoubleOrNull() ?: error("Enter a valid $label.")
        if (!value.isFinite()) error("Enter a valid $label.")
        return value
    }

    private fun validate(kind: String, value: Double, label: String): Double = when (kind) {
        "n" -> value
        "pos" -> value.also { if (it <= 0) error("$label must be greater than 0.") }
        "integer" -> value.also { if (it % 1.0 != 0.0) error("$label must be a whole number.") }
        else -> error("Unsupported calculator validator $kind")
    }

    private fun gcd(a0: Double, b0: Double): Int {
        var a = abs(a0.toInt())
        var b = abs(b0.toInt())
        while (b != 0) {
            val tmp = a % b
            a = b
            b = tmp
        }
        return if (a == 0) 1 else a
    }

    private fun formatNumber(value: Double): String = when {
        value.isNaN() -> "NaN"
        value == Double.POSITIVE_INFINITY -> "∞"
        value == Double.NEGATIVE_INFINITY -> "-∞"
        else -> numberFormat.format(value)
    }

    private fun jsString(value: Double): String = when {
        value.isNaN() -> "NaN"
        value == Double.POSITIVE_INFINITY -> "Infinity"
        value == Double.NEGATIVE_INFINITY -> "-Infinity"
        value == 0.0 -> "0"
        value % 1.0 == 0.0 -> value.toLong().toString()
        else -> value.toString()
    }

    private fun parseOperations(): Map<String, Operation> {
        val root = JSONObject(NativeCalculatorData.JSON)
        val tools = root.getJSONArray("tools")
        val result = LinkedHashMap<String, Operation>(tools.length())
        for (i in 0 until tools.length()) {
            val tool = tools.getJSONObject(i)
            val id = tool.getString("id")
            val fieldsArray = tool.getJSONArray("fields")
            val fields = buildList(fieldsArray.length()) {
                for (j in 0 until fieldsArray.length()) {
                    val field = fieldsArray.getJSONObject(j)
                    add(
                        Field(
                            name = field.getString("name"),
                            label = field.getString("label"),
                            defaultValue = field.optString("defaultValue", ""),
                            suffix = field.optString("suffix", null),
                            hint = field.optString("hint", null),
                            placeholder = field.optString("placeholder", null),
                        )
                    )
                }
            }
            val outputArray = tool.getJSONArray("outputs")
            val outputs = buildList(outputArray.length()) {
                for (j in 0 until outputArray.length()) {
                    val raw = outputArray.getJSONObject(j)
                    add(
                        OutputSpec(
                            label = raw.getString("label"),
                            value = parseExpr(raw.get("value")),
                            primary = raw.optBoolean("primary", false),
                            hint = raw.optString("hint", null),
                        )
                    )
                }
            }
            result[id] = Operation(
                id = id,
                formula = tool.optString("formula", null),
                fields = fields,
                outputs = outputs,
            )
        }
        return result
    }

    private fun parseExpr(raw: Any): Expr {
        if (raw is String) return Expr.StringValue(raw)
        val objectValue = raw as JSONObject
        return when (objectValue.getString("kind")) {
            "const" -> Expr.Const(objectValue.getDouble("value"))
            "string" -> Expr.StringValue(objectValue.getString("value"))
            "value" -> Expr.Value(
                name = objectValue.getString("name"),
                validator = objectValue.getString("validator"),
                label = objectValue.optString("label", null),
            )
            "validate" -> Expr.Validate(
                validator = objectValue.getString("validator"),
                arg = parseExpr(objectValue.get("arg")),
                label = objectValue.optString("label", null),
            )
            "unary" -> Expr.Unary(
                op = objectValue.getString("op"),
                arg = parseExpr(objectValue.get("arg")),
            )
            "binary" -> Expr.Binary(
                op = objectValue.getString("op"),
                left = parseExpr(objectValue.get("left")),
                right = parseExpr(objectValue.get("right")),
            )
            "call" -> {
                val rawArgs = objectValue.getJSONArray("args")
                Expr.Call(objectValue.getString("name"), buildList(rawArgs.length()) { for (j in 0 until rawArgs.length()) add(parseExpr(rawArgs.get(j))) })
            }
            "template" -> {
                val rawParts = objectValue.getJSONArray("parts")
                Expr.Template(buildList(rawParts.length()) { for (j in 0 until rawParts.length()) add(if (rawParts.get(j) is String) rawParts.getString(j) else parseExpr(rawParts.getJSONObject(j))) })
            }
            else -> error("Unsupported calculator expression kind ${objectValue.getString("kind")}")
        }
    }
}

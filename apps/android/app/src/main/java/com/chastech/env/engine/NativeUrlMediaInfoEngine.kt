package com.chastech.env.engine

/**
 * Boundary for the catalog's URL Media Inspector.
 *
 * The web implementation obtains title, uploader, duration, thumbnail, codecs,
 * resolution, and formats from a remote media service. A URL alone does not
 * contain those values, so this family intentionally exposes no offline
 * operation rather than pretending to inspect a remote resource locally.
 */
object NativeUrlMediaInfoEngine {
    /** The active catalog entry, recorded for tests and documentation only. */
    val canonicalToolIds: Set<String> = setOf("url-media-inspector")

    /** No catalog ID has complete local semantics for this backend-dependent family. */
    val supportedToolIds: Set<String> = emptySet()

    fun operationForTool(id: String): String? = null

    /**
     * Refuse execution instead of making a network request or returning guessed
     * metadata. This keeps native behavior honest and strictly offline.
     */
    fun run(
        toolId: String,
        input: String = "",
        options: Map<String, String> = emptyMap()
    ): Nothing {
        throw UnsupportedOperationException(
            "URL media inspection is not available offline; the URL Media Inspector requires its remote metadata service."
        )
    }
}

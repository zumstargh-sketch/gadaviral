package com.gadaviral.app

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Minimal JSON API client for the GADAVIRAL backend (same API as all platforms). */
object Api {
    private const val BASE = BuildConfig.API_BASE_URL
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    sealed class Result {
        data class Ok(val status: Int, val body: JSONObject) : Result()
        data class Fail(val status: Int, val message: String, val code: String?) : Result()
    }

    /** All API paths are versioned under /api/v1 (same as the web client). */
    private const val API_PREFIX = "/api/v1"

    fun request(method: String, path: String, body: JSONObject? = null, auth: Boolean = false): Result {
        val builder = Request.Builder().url(BASE + API_PREFIX + path)
        if (auth) Session.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        val payload = body?.toString()?.toRequestBody(JSON_TYPE)
            ?: (if (method in listOf("POST", "PUT", "PATCH")) "{}".toRequestBody(JSON_TYPE) else null)
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post(payload!!)
            "PUT" -> builder.put(payload!!)
            "PATCH" -> builder.patch(payload!!)
            "DELETE" -> builder.delete()
        }
        return try {
            val res = http.newCall(builder.build()).execute()
            val text = res.body?.string() ?: "{}"
            val json = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (res.isSuccessful) {
                Result.Ok(res.code, json)
            } else {
                val err = json.optJSONObject("error")
                Result.Fail(res.code, err?.optString("message") ?: "Request failed (${res.code})", err?.optString("code"))
            }
        } catch (e: Exception) {
            Result.Fail(0, "Network error — check your connection. ${e.message ?: ""}".trim(), null)
        }
    }

    private val mediaClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    /** Downloads raw bytes (e.g. seeded-member avatar PNGs) relative to the API origin. */
    fun download(path: String): ByteArray? = try {
        mediaClient.newCall(Request.Builder().url(BASE + path).build()).execute().use { res ->
            if (res.isSuccessful) res.body?.bytes() else null
        }
    } catch (_: Exception) { null }
}

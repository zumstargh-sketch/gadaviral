package com.gadaviral.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Secure session storage (encrypted at rest). The same tokens authenticate
 * against the SAME backend used by the website and the Windows app.
 */
object Session {
    private var prefs: android.content.SharedPreferences? = null

    fun init(ctx: Context) {
        val masterKey = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        prefs = EncryptedSharedPreferences.create(
            ctx, "gadaviral_session", masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var accessToken: String?
        get() = prefs?.getString("access", null)
        set(v) { prefs?.edit()?.putString("access", v)?.apply() }

    var refreshToken: String?
        get() = prefs?.getString("refresh", null)
        set(v) { prefs?.edit()?.putString("refresh", v)?.apply() }

    var username: String?
        get() = prefs?.getString("username", null)
        set(v) { prefs?.edit()?.putString("username", v)?.apply() }

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    fun clear() = prefs?.edit()?.clear()?.apply()
}

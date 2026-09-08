package com.gadaviral.app

import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Receives gadaviral://auth/... callbacks (e.g. password reset links opened on
 * the device route back into the app).
 */
class GoogleCallbackActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri: Uri? = intent?.data
        val token = uri?.getQueryParameter("token")
        val target = if (uri?.host == "auth" && !token.isNullOrBlank()) {
            MainActivity::class.java
        } else MainActivity::class.java
        startActivity(android.content.Intent(this, target))
        finish()
    }
}

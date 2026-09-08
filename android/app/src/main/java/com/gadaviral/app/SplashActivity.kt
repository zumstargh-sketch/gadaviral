package com.gadaviral.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF0B0B0D.toInt())
        }
        // Official logo image + wordmark
        layout.addView(Branding.logoHeader(this, 96f))
        val tag = TextView(this).apply {
            text = "DANGME & GA ONLINE SOCIAL COMMUNITY"
            textSize = 11f
            setTextColor(Branding.MUTED)
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 0)
            letterSpacing = 0.12f
        }
        layout.addView(tag)
        // Seeded community members' profile pictures (bundled → instant, offline-safe)
        Branding.attachCommunity(this, layout, withLiveRefresh = false)
        layout.addView(Branding.madeBy(this))
        setContentView(layout)

        Handler(Looper.getMainLooper()).postDelayed({
            startActivity(
                Intent(this, if (Session.isLoggedIn) MainActivity::class.java else LoginActivity::class.java)
            )
            finish()
        }, 1100)
    }
}

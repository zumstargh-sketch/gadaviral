package com.gadaviral.app

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Outline
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * Shared branding for the splash and sign-in / sign-up screens:
 *  • official logo header (logo image + GADAVIRAL wordmark)
 *  • strip of seeded-community member profile pictures — bundled avatars render
 *    instantly, then the REAL seeded members' pictures are fetched from
 *    GET /api/v1/community/highlights and swap in (bundled set stays offline)
 *  • "Made by DATILA Solutions" credit
 */
object Branding {
    const val GOLD = 0xFFF2A900.toInt()
    const val TEXT = 0xFFF4F4F5.toInt()
    const val MUTED = 0xFF9CA3AF.toInt()

    private val BUNDLED = intArrayOf(
        R.drawable.member_01, R.drawable.member_02, R.drawable.member_03, R.drawable.member_04,
        R.drawable.member_05, R.drawable.member_06, R.drawable.member_07, R.drawable.member_08,
    )

    private fun dp(activity: Activity, v: Float): Int = (v * activity.resources.displayMetrics.density).toInt()
    private fun dpF(activity: Activity, v: Float): Float = v * activity.resources.displayMetrics.density

    private fun ovalOutline(): ViewOutlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) { outline.setOval(0, 0, view.width, view.height) }
    }

    private fun roundedOutline(radiusPx: Float): ViewOutlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
            outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
        }
    }

    /** Official logo image + GADAVIRAL wordmark. */
    fun logoHeader(activity: Activity, logoDp: Float = 72f): LinearLayout {
        val wrap = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val logo = ImageView(activity).apply {
            setImageResource(R.mipmap.ic_launcher)
            val s = dp(activity, logoDp)
            layoutParams = LinearLayout.LayoutParams(s, s)
            clipToOutline = true
            outlineProvider = roundedOutline(dpF(activity, 18f))
        }
        val word = TextView(activity).apply {
            text = "GADAVIRAL"; textSize = 30f; setTextColor(GOLD)
            gravity = Gravity.CENTER; letterSpacing = 0.08f
            setPadding(0, dp(activity, 10f), 0, 0)
        }
        wrap.addView(logo)
        wrap.addView(word)
        return wrap
    }

    /**
     * Adds the community block (overlapping member avatar strip + caption) to
     * [parent]. Bundled seeded-member avatars show immediately; with
     * [withLiveRefresh] the real seeded members' profile pictures load from the
     * backend and replace them (silently skipped when offline).
     */
    fun attachCommunity(activity: Activity, parent: LinearLayout, withLiveRefresh: Boolean = true) {
        val size = dp(activity, 38f)
        val strip = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        BUNDLED.forEachIndexed { i, res ->
            val lp = LinearLayout.LayoutParams(size, size)
            if (i > 0) lp.marginStart = dp(activity, -8f)
            val iv = ImageView(activity).apply {
                setImageResource(res)
                scaleType = ImageView.ScaleType.CENTER_CROP
                layoutParams = lp
                clipToOutline = true
                outlineProvider = ovalOutline()
            }
            strip.addView(iv)
        }
        val caption = TextView(activity).apply {
            text = "Ga & Dangme members are already here"
            textSize = 12.5f
            setTextColor(MUTED)
            gravity = Gravity.CENTER
            setPadding(0, dp(activity, 8f), 0, 0)
        }
        val block = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, dp(activity, 22f), 0, 0)
        }
        block.addView(strip)
        block.addView(caption)
        parent.addView(block)
        if (withLiveRefresh) refreshCommunity(activity, strip, caption, size)
    }

    /** Fetches the real seeded members (PNG profile pictures) into the strip. */
    private fun refreshCommunity(activity: Activity, strip: LinearLayout, caption: TextView, sizePx: Int) {
        Thread {
            try {
                val res = Api.request("GET", "/community/highlights")
                if (res !is Api.Result.Ok) return@Thread
                val items = res.body.optJSONArray("items") ?: return@Thread
                val total = res.body.optInt("total", 0)
                val urls = ArrayList<String>()
                val names = ArrayList<String>()
                for (i in 0 until items.length()) {
                    val o: JSONObject? = items.optJSONObject(i)
                    val url = o?.optString("avatar_url") ?: ""
                    if (url.isNotBlank()) { urls.add(url); names.add(o?.optString("full_name") ?: "") }
                }
                if (urls.isEmpty()) return@Thread
                val bitmaps = urls.take(8).map { decode(Api.download(it), sizePx * 2) }
                activity.runOnUiThread {
                    strip.removeAllViews()
                    bitmaps.forEachIndexed { i, bmp ->
                        if (bmp == null) return@forEachIndexed
                        val lp = LinearLayout.LayoutParams(sizePx, sizePx)
                        if (i > 0) lp.marginStart = dp(activity, -8f)
                        val iv = ImageView(activity).apply {
                            setImageBitmap(bmp)
                            scaleType = ImageView.ScaleType.CENTER_CROP
                            layoutParams = lp
                            clipToOutline = true
                            outlineProvider = ovalOutline()
                            contentDescription = names[i]
                        }
                        strip.addView(iv)
                    }
                    if (total > 0) caption.text = "$total members already sharing — join them"
                }
            } catch (_: Exception) { /* offline → bundled avatars remain */ }
        }.start()
    }

    private fun decode(bytes: ByteArray?, targetPx: Int): Bitmap? {
        if (bytes == null) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= targetPx) sample *= 2
        return BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    /** "Made by DATILA Solutions" credit line (gold studio name). */
    fun madeBy(activity: Activity): TextView {
        val t = TextView(activity).apply {
            gravity = Gravity.CENTER
            textSize = 12f
            setPadding(0, dp(activity, 16f), 0, 0)
        }
        val s = SpannableString("Made by DATILA Solutions")
        s.setSpan(ForegroundColorSpan(MUTED), 0, 8, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        s.setSpan(ForegroundColorSpan(GOLD), 8, s.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        s.setSpan(StyleSpan(android.graphics.Typeface.BOLD), 8, s.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        t.text = s
        return t
    }
}
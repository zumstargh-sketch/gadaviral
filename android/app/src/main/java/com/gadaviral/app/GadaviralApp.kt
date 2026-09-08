package com.gadaviral.app

import android.app.Application

class GadaviralApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Session.init(this)
    }
}

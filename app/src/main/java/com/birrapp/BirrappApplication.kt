package com.birrapp

import android.app.Application
import com.birrapp.di.AppContainer

class BirrappApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

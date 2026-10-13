package com.cutly.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView

import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import expo.modules.splashscreen.SplashScreenManager

/**
 * First frame of the launch Lottie (coral + CutLy.) until the player paints.
 * Signed-in continues home after the clip, with no Get Started button.
 */
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val splashScreen = installSplashScreen()
    splashScreen.setOnExitAnimationListener { provider -> provider.remove() }
    setTheme(R.style.AppTheme)

    window.decorView.setBackgroundColor(LAUNCH_CORAL)
    super.onCreate(null)

    SplashScreenManager.hide()
    attachLaunchBridge()

    // Last-resort only — signed-in JS dismisses after home paints.
    Handler(Looper.getMainLooper()).postDelayed({ dismissLaunchBridge() }, 12000L)
  }

  private fun attachLaunchBridge() {
    if (launchBridge != null) return

    val frame = FrameLayout(this).apply {
      setBackgroundColor(LAUNCH_CORAL)
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      elevation = 100f
      isClickable = true
      addView(ImageView(this@MainActivity).apply {
        setImageResource(R.drawable.splash_launch_frame)
        scaleType = ImageView.ScaleType.CENTER_CROP
        layoutParams = FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      })
    }

    addContentView(
      frame,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )
    launchBridge = frame
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled
      ) {}
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }
    super.invokeDefaultOnBackPressed()
  }

  companion object {
    /** App accent. Matches the recolored launch Lottie. */
    private val LAUNCH_CORAL: Int = Color.parseColor("#F06B55")

    @JvmStatic
    @Volatile
    private var launchBridge: ViewGroup? = null

    @JvmStatic
    fun dismissLaunchBridge() {
      Handler(Looper.getMainLooper()).post {
        val bridge = launchBridge ?: return@post
        launchBridge = null
        (bridge.parent as? ViewGroup)?.removeView(bridge)
      }
    }
  }
}

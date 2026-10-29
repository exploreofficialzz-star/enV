package com.chastech.env;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.godotengine.godot.Godot;
import org.godotengine.godot.GodotActivity;

/** Hosts one isolated native Godot instance for an already validated project. */
public final class NativeGameRuntimeActivity extends GodotActivity {
    private void showGameFullScreen() {
        Godot godot = getGodot();
        if (godot != null) {
            godot.enableEdgeToEdge(true, true);
            godot.enableImmersiveMode(true, true);
        }
    }

    @Override
    public void onGodotMainLoopStarted() {
        runOnUiThread(this::showGameFullScreen);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) showGameFullScreen();
    }

    @Override
    public List<String> getCommandLine() {
        File project = new File(getFilesDir(), "game-preview/project.json");
        List<String> args = new ArrayList<>(super.getCommandLine());
        args.addAll(Arrays.asList("--main-pack", "res://env-game-runtime.pck", "--",
                "--env-project=" + project.getAbsolutePath()));
        return args;
    }
}

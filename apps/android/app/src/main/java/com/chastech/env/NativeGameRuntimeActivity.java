package com.chastech.env;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.godotengine.godot.GodotActivity;

/** Hosts one isolated native Godot instance for an already validated project. */
public final class NativeGameRuntimeActivity extends GodotActivity {
    @Override
    public List<String> getCommandLine() {
        File project = new File(getFilesDir(), "game-preview/project.json");
        List<String> args = new ArrayList<>(super.getCommandLine());
        args.addAll(Arrays.asList("--main-pack", "res://env-game-runtime.pck", "--",
                "--env-project=" + project.getAbsolutePath()));
        return args;
    }
}

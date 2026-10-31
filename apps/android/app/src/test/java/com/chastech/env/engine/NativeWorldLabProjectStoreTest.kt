package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import org.json.JSONObject

class NativeWorldLabProjectStoreTest {
    @Test fun atomicLocalSaveAndReopenPreservesPortableBytes() {
        val root=Files.createTempDirectory("world-lab-android-store").toFile()
        try {
            val store=NativeWorldLabProjectStore(root)
            assertNull(store.loadLatest())
            val a=NativeWorldLabEditor.blank("Local physics")
            val saved=store.save(a)
            assertEquals("Local physics",saved.title)
            assertEquals(a,store.loadLatest()!!.json)
            val b=NativeWorldLabEditor.addSolid(a,"box",id="new-geometry")
            store.save(b)
            assertEquals(1,NativeWorldLabProjectCodec.decode(store.loadLatest()!!.json).entities.size)
            assertThrows(IllegalArgumentException::class.java){store.save(a)}
            assertEquals(b,store.read(saved.id).json)
        }finally{root.deleteRecursively()}
    }
    @Test fun rejectsCorruptOnDiskStateAndPathTraversal(){
        val root=Files.createTempDirectory("world-lab-android-corruption").toFile()
        try {
            val store=NativeWorldLabProjectStore(root)
            val file=NativeWorldLabEditor.blank()
            val saved=store.save(file)
            assertThrows(IllegalArgumentException::class.java){store.read("../escape")}
            val corrupt=java.io.File(root,"world-lab-v1/"+saved.id+".json")
            corrupt.writeText("{broken")
            assertThrows(Exception::class.java){store.loadLatest()}
            assertThrows(Exception::class.java){store.save(file)}
        }finally{root.deleteRecursively()}
    }
    @Test fun rejectsSkippedRevisionsAsAmbiguousConflict() {
        val root=Files.createTempDirectory("world-lab-android-skipped").toFile()
        try {
            val store=NativeWorldLabProjectStore(root)
            val initial=NativeWorldLabEditor.blank()
            val initialProject=store.save(initial)
            val future=JSONObject(initial)
            future.put("revision",10)
            assertThrows(IllegalArgumentException::class.java){store.save(future.toString())}
            assertEquals(initial,store.read(initialProject.id).json)
        }finally{root.deleteRecursively()}
    }
    @Test fun rejectsSameRevisionDifferentContentWithoutErasingPrevious(){
        val root=Files.createTempDirectory("world-lab-android-conflict").toFile()
        try {
            val store=NativeWorldLabProjectStore(root)
            val json=NativeWorldLabEditor.blank()
            store.save(json)
            val rootJson=JSONObject(json)
            rootJson.put("title","Conflicting")
            val modified=rootJson.toString()
            assertThrows(IllegalArgumentException::class.java){store.save(modified)}
            assertEquals(json,store.loadLatest()!!.json)
        }finally{root.deleteRecursively()}
    }
}

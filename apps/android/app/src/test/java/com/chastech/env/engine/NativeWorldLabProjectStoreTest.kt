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
    @Test fun browseDeleteAndRevisionSafeMultiEditSave(){
        val root=Files.createTempDirectory("world-lab-browse").toFile()
        try {
            val store=NativeWorldLabProjectStore(root)
            val first=NativeWorldLabEditor.blank("First")
            val saved=store.save(first)
            var edited=NativeWorldLabEditor.addSolid(first,"box",id="a")
            edited=NativeWorldLabEditor.addSolid(edited,"sphere",id="b")
            assertThrows(IllegalArgumentException::class.java){store.save(edited)}
            store.save(edited,expectedSavedRevision=saved.revision)
            assertEquals(2,store.read(saved.id).let{
                NativeWorldLabProjectCodec.decode(it.json).entities.size})
            val second=store.save(NativeWorldLabEditor.blank("Second"))
            assertEquals(2,store.listProjects().size)
            assertThrows(IllegalArgumentException::class.java){
                store.save(edited,expectedSavedRevision=0)
            }
            store.delete(second.id)
            assertEquals(saved.id,store.loadLatest()!!.id)
            assertEquals(1,store.listProjects().size)
            assertThrows(IllegalArgumentException::class.java){store.delete("../escape")}
            store.delete(saved.id)
            assertNull(store.loadLatest())
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
    }    @Test fun draftCacheIsSeparateFromCommittedProjectsAndRequiresExplicitRestore(){
        val root=Files.createTempDirectory("world-lab-android-draft").toFile()
        try{
            val store=NativeWorldLabProjectStore(root)
            val original=NativeWorldLabEditor.blank()
            val saved=store.save(original)
            val draft=NativeWorldLabEditor.addSolid(original,"sphere",id="invented")
            store.saveDraft(draft)
            assertEquals(1,store.listDrafts().size)
            assertEquals(0,NativeWorldLabProjectCodec.decode(store.read(saved.id).json).entities.size)
            assertEquals(1,NativeWorldLabProjectCodec.decode(store.readDraft(saved.id).json).entities.size)
            assertThrows(IllegalArgumentException::class.java){store.readDraft("../bad")}
            store.deleteDraft(saved.id)
            assertTrue(store.listDrafts().isEmpty())
            assertEquals(original,store.read(saved.id).json)
        }finally{root.deleteRecursively()}
    }
    @Test fun completeNativeArchiveRoundtripPreservesInventedProjectAndScience(){
        val first=Files.createTempDirectory("world-lab-archive-export").toFile()
        val second=Files.createTempDirectory("world-lab-archive-import").toFile()
        try{
            var source=NativeWorldLabEditor.blank()
            source=NativeWorldLabEditor.addSolid(source,"sphere",id="orbit-one")
            source=NativeWorldLabEditor.addSolid(source,"sphere",id="orbit-two")
            source=NativeWorldLabEditor.positionSolid(source,"orbit-one",listOf(0.0,0.5,0.0))
            source=NativeWorldLabEditor.positionSolid(source,"orbit-two",listOf(20.0,0.5,0.0))
            source=NativeWorldLabEditor.addHypotheticalMaterial(source,
                "Invented mass",100000.0,id="material")
            source=NativeWorldLabEditor.assignMaterial(source,"orbit-one","material")
            source=NativeWorldLabEditor.assignMaterial(source,"orbit-two","material")
            val project=NativeWorldLabProjectCodec.decode(source)
            NativeWorldLabProjectStore(first).save(source)
            val model=NativeWorldLabGravity.evaluate(project,
                listOf("orbit-one","orbit-two"),emptyMap(),1.0,40)
            NativeWorldLabEvidenceStore(first).save(project,
                NativeWorldLabEvidenceJson.gravity(model))
            val portable=NativeWorldLabPortableArchiveStore(first).export(source)
            assertEquals(2,org.json.JSONObject(portable).getInt("schemaVersion"))
            val restored=NativeWorldLabPortableArchiveStore(second).import(portable)
            assertEquals(project.id,restored.project.id)
            assertEquals(1,NativeWorldLabEvidenceStore(second).list(project.id).size)
            assertThrows(IllegalArgumentException::class.java){
                NativeWorldLabPortableArchiveStore(second).import(portable)
            }
        }finally{first.deleteRecursively();second.deleteRecursively()}
    }

}


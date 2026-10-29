import sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import library_store as lib
class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.root=self.temp.name
    def tearDown(self): self.temp.cleanup()
    def put(self,rows,category='collage'):
        p=lib.blank(category);p['records']=rows;return lib.merge(self.root,category,p)
    def test_source_identity_and_newer_decision(self):
        base={'id':'device-a','platform':'小红书','platform_post_id':'abc','seen':True,'review_status':'excluded','updated_at':'2026-10-28T10:00:00+08:00'}
        self.put([base]); out=self.put([{**base,'id':'device-b','review_status':'accepted','seen':False,'updated_at':'2026-10-27T10:00:00+08:00'}])
        self.assertEqual(len(out['records']),1);self.assertEqual(out['records'][0]['review_status'],'excluded');self.assertTrue(out['records'][0]['seen'])
        out=self.put([{**base,'id':'device-b','review_status':'lead','seen':False,'updated_at':'2026-10-29T10:00:00+08:00'}]);self.assertEqual(out['records'][0]['id'],'device-a');self.assertTrue(out['records'][0]['seen'])
    def test_url_and_category_isolation(self):
        self.put([{'id':'a','url':'https://example.org/p?utm_source=x#here','seen':True}]); out=self.put([{'id':'b','url':'https://example.org/p'}]);self.assertEqual(len(out['records']),1)
        self.assertEqual(lib.read(self.root,'makeup')['records'],[])
        p=lib.blank('collage');p['records']=[{'id':'bad','resource_category':'makeup'}]
        with self.assertRaises(ValueError):lib.merge(self.root,'collage',p)
    def test_restore_preserves_later_seen(self):
        self.put([{'id':'a','seen':True}]); self.put([{'id':'b','seen':True}]); name=lib.snapshots(self.root,'collage')[0]
        out=lib.restore(self.root,'collage',name); self.assertEqual({r['id'] for r in out['records']},{'a','b'}); self.assertTrue(all(r['seen'] for r in out['records'])); self.assertEqual(out['events'][-1]['type'],'restore')
    def test_same_post_different_images(self):
        out=self.put([{'id':'one','platform':'A','platform_post_id':'p','media_index':1},{'id':'two','platform':'A','platform_post_id':'p','media_index':2}]);self.assertEqual(len(out['records']),2)
if __name__=='__main__':unittest.main()
